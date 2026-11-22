<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20261122211221 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE TABLE challenge (id INT AUTO_INCREMENT NOT NULL, titre VARCHAR(150) NOT NULL, enonce LONGTEXT NOT NULL, difficulte VARCHAR(10) NOT NULL, points INT NOT NULL, flag_hash VARCHAR(255) NOT NULL, fichier_joint VARCHAR(255) DEFAULT NULL, actif TINYINT NOT NULL, indice LONGTEXT DEFAULT NULL, cout_indice INT NOT NULL, type_objet VARCHAR(20) NOT NULL, pos_x INT DEFAULT NULL, pos_y INT DEFAULT NULL, salle VARCHAR(50) DEFAULT NULL, prerequis_id INT DEFAULT NULL, INDEX IDX_D7098951ED196790 (prerequis_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE messenger_messages (id BIGINT AUTO_INCREMENT NOT NULL, body LONGTEXT NOT NULL, headers LONGTEXT NOT NULL, queue_name VARCHAR(190) NOT NULL, created_at DATETIME NOT NULL, available_at DATETIME NOT NULL, delivered_at DATETIME DEFAULT NULL, INDEX IDX_75EA56E0FB7336F0E3BD61CE16BA31DBBF396750 (queue_name, available_at, delivered_at, id), PRIMARY KEY (id))');
        $this->addSql('ALTER TABLE challenge ADD CONSTRAINT FK_D7098951ED196790 FOREIGN KEY (prerequis_id) REFERENCES challenge (id) ON DELETE SET NULL');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE challenge DROP FOREIGN KEY FK_D7098951ED196790');
        $this->addSql('DROP TABLE challenge');
        $this->addSql('DROP TABLE messenger_messages');
    }
}
