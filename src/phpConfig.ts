import { PhpFpmUserOptions } from "php-fpm";

export const PHP_CONFIG = {
    sockFile: "/run/php/php8.1-fpm.sock"
} satisfies PhpFpmUserOptions;
