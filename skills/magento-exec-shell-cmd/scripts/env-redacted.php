<?php
/**
 * Prints the Magento app/etc/env.php of the current directory as JSON with secret values masked
 * (passwords, keys, tokens, salts, DSNs), so an agent or a screenshot can show the structure safely.
 * Read from stdin by env-redacted.sh, which runs it in the project's runtime.
 */
declare(strict_types=1);

// MAGENTO_ENV_PHP: another file in the same format (tests, a copied config).
$file = getenv('MAGENTO_ENV_PHP') ?: getcwd() . '/app/etc/env.php';
if (!is_file($file)) {
    fwrite(STDERR, 'app/etc/env.php not found in ' . getcwd() . PHP_EOL);
    exit(1);
}

$secret = '/pass|secret|key|token|salt|credential|auth|dsn|user(name)?$|license/i';
$mask = static function ($value, $key = '') use (&$mask, $secret) {
    if (is_array($value)) {
        $out = [];
        foreach ($value as $k => $v) {
            $out[$k] = $mask($v, (string)$k);
        }
        return $out;
    }
    if ((is_string($value) && $value !== '' || is_int($value) || is_float($value)) && preg_match($secret, $key)) {
        return '******';
    }
    if (is_string($value)) {
        // Credentials inside URLs/DSNs under any key: scheme://user:pass@host, ?auth=..., ?password=...
        $value = (string)preg_replace('#(://)[^/@\s]+@#', '$1******@', $value);
        $value = (string)preg_replace('/([?&;](?:auth|password|passwd|pass|pwd|secret|token|key)=)[^&;\s]*/i', '$1******', $value);
    }
    return $value;
};

echo json_encode($mask(include $file), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
