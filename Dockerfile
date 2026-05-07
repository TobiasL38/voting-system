FROM php:7.4-apache

RUN docker-php-ext-install pdo_mysql

RUN a2dismod mpm_event && a2enmod mpm_prefork

RUN a2enmod rewrite

COPY . /var/www/html/

RUN chown -R www-data:www-data /var/www/html && chmod -R 755 /var/www/html

EXPOSE 80

CMD [\"apache2-foreground\"]
