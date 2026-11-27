<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

/**
 * A fixed learning module shown in a room.
 *
 * Slots are shared by challenges and modules; posX/posY remain nullable for
 * older data, but the rooms place objects by slot id.
 */
#[ORM\Entity]
class Module
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 150)]
    private string $titre = '';

    #[ORM\Column(length: 50, nullable: true)]
    private ?string $salle = null;

    #[ORM\Column(nullable: true)]
    private ?int $posX = null;

    #[ORM\Column(nullable: true)]
    private ?int $posY = null;

    #[ORM\Column(length: 100, nullable: true)]
    private ?string $slot = null;

    public function getId(): ?int { return $this->id; }

    public function getTitre(): string { return $this->titre; }
    public function setTitre(string $titre): static { $this->titre = $titre; return $this; }

    public function getSalle(): ?string { return $this->salle; }
    public function setSalle(?string $salle): static { $this->salle = $salle; return $this; }

    public function getPosX(): ?int { return $this->posX; }
    public function setPosX(?int $posX): static { $this->posX = $posX; return $this; }

    public function getPosY(): ?int { return $this->posY; }
    public function setPosY(?int $posY): static { $this->posY = $posY; return $this; }

    public function getSlot(): ?string { return $this->slot; }
    public function setSlot(?string $slot): static { $this->slot = $slot; return $this; }
}
