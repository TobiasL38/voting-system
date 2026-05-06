-- database.sql
CREATE DATABASE IF NOT EXISTS voting_app;
USE voting_app;

CREATE TABLE contenders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE votes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contender_id INT NOT NULL,
    voter_session VARCHAR(255) NOT NULL,
    voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contender_id) REFERENCES contenders(id) ON DELETE CASCADE,
    INDEX idx_session (voter_session)
);

-- Sample contenders
INSERT INTO contenders (name, description) VALUES
('Alex Morgan', 'Innovation for tomorrow, sustainability today'),
('Jamie Lin', 'Equity, growth, and community first'),
('Taylor Reed', 'Smart leadership, bold decisions'),
('Casey Parker', 'Grassroots movement for real change');