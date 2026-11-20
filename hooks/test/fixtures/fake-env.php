<?php
// Fake Magento env.php for testing skills/magento-exec-shell-cmd/scripts/env-redacted.php.
// Every secret-looking value starts with "fake_" (or is a fake number); none may appear in the output.
return [
    'db' => [
        'connection' => [
            'default' => ['host' => 'db', 'dbname' => 'magento', 'username' => 'fake_user', 'password' => 'fake_pw', 'port' => 3306],
        ],
    ],
    'cache' => [
        'frontend' => [
            'default' => [
                'backend_options' => [
                    'server' => 'redis://:fake_redis_pw@redis:6379/0',
                    'connection_string' => 'amqp://fake_mq_user:fake_mq_pw@rabbit:5672/',
                    'tcp' => 'tcp://redis:6379?auth=fake_auth_pw&database=1',
                    'plain' => 'https://example.com/path',
                ],
            ],
        ],
    ],
    'payment' => ['api_secret' => 99887766],
    'crypt' => ['key' => 'fake_crypt_key'],
];
