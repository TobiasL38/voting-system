FROM php:7.4-cli
RUN docker-php-ext-install pdo_mysql
COPY . /app
WORKDIR /app
EXPOSE 8080
CMD ["php", "-S", "0.0.0.0:8080", "-t", "/app"]
