<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Rooms place objects at slots instead of tile coordinates.
 * posX/posY stay nullable for older rows; the game no longer uses them.
 */
final class Version20261127120000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add nullable slot to Challenge and create Module with slot';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE challenge ADD slot VARCHAR(100) DEFAULT NULL');
        $this->addSql('CREATE TABLE module (id INT AUTO_INCREMENT NOT NULL, titre VARCHAR(150) NOT NULL, salle VARCHAR(50) DEFAULT NULL, pos_x INT DEFAULT NULL, pos_y INT DEFAULT NULL, slot VARCHAR(100) DEFAULT NULL, PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE module');
        $this->addSql('ALTER TABLE challenge DROP slot');
    }
}
