<?php
$host = 'localhost';
$dbname = 'voting_app';
$username = 'root';   // Change if your MySQL user is different
$password = '';       // Change if you have a MySQL password

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch(PDOException $e) {
    die(json_encode(['error' => 'DB Connection failed: ' . $e->getMessage()]));
}
?>