<?php

namespace App\Entity;

use App\Repository\ChallengeRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: ChallengeRepository::class)]
class Challenge
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 150)]
    private string $titre = '';

    #[ORM\Column(type: Types::TEXT)]
    private string $enonce = '';

    #[ORM\Column(length: 10)]
    private string $difficulte = 'facile'; // facile | moyen | difficile

    #[ORM\Column]
    private int $points = 10;

    #[ORM\Column(length: 255)]
    private string $flagHash = '';

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $fichierJoint = null;

    #[ORM\Column]
    private bool $actif = true;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $indice = null;

    #[ORM\Column]
    private int $coutIndice = 0;

    #[ORM\Column(length: 20)]
    private string $typeObjet = 'terminal'; // terminal | coffre | porte | serveur

    #[ORM\Column(nullable: true)]
    private ?int $posX = null;

    #[ORM\Column(nullable: true)]
    private ?int $posY = null;

    // Id of the slot.rect where the server places this object in a room.
    // posX/posY stay nullable; no tile coordinates are used by the game.
    #[ORM\Column(length: 100, nullable: true)]
    private ?string $slot = null;

    // TEMPORARY: room id such as 'ctf'. Becomes a ManyToOne Lab once member C's entity exists.
    #[ORM\Column(length: 50, nullable: true)]
    private ?string $salle = null;

    #[ORM\ManyToOne(targetEntity: self::class)]
    #[ORM\JoinColumn(onDelete: 'SET NULL')]
    private ?self $prerequis = null;

    public function getId(): ?int { return $this->id; }

    public function getTitre(): string { return $this->titre; }
    public function setTitre(string $titre): static { $this->titre = $titre; return $this; }

    public function getEnonce(): string { return $this->enonce; }
    public function setEnonce(string $enonce): static { $this->enonce = $enonce; return $this; }

    public function getDifficulte(): string { return $this->difficulte; }
    public function setDifficulte(string $difficulte): static { $this->difficulte = $difficulte; return $this; }

    public function getPoints(): int { return $this->points; }
    public function setPoints(int $points): static { $this->points = $points; return $this; }

    public function getFlagHash(): string { return $this->flagHash; }
    public function setFlagHash(string $flagHash): static { $this->flagHash = $flagHash; return $this; }

    public function getFichierJoint(): ?string { return $this->fichierJoint; }
    public function setFichierJoint(?string $fichierJoint): static { $this->fichierJoint = $fichierJoint; return $this; }

    public function isActif(): bool { return $this->actif; }
    public function setActif(bool $actif): static { $this->actif = $actif; return $this; }

    public function getIndice(): ?string { return $this->indice; }
    public function setIndice(?string $indice): static { $this->indice = $indice; return $this; }

    public function getCoutIndice(): int { return $this->coutIndice; }
    public function setCoutIndice(int $coutIndice): static { $this->coutIndice = $coutIndice; return $this; }

    public function getTypeObjet(): string { return $this->typeObjet; }
    public function setTypeObjet(string $typeObjet): static { $this->typeObjet = $typeObjet; return $this; }

    public function getPosX(): ?int { return $this->posX; }
    public function setPosX(?int $posX): static { $this->posX = $posX; return $this; }

    public function getPosY(): ?int { return $this->posY; }
    public function setPosY(?int $posY): static { $this->posY = $posY; return $this; }

    public function getSlot(): ?string { return $this->slot; }
    public function setSlot(?string $slot): static { $this->slot = $slot; return $this; }

    public function getSalle(): ?string { return $this->salle; }
    public function setSalle(?string $salle): static { $this->salle = $salle; return $this; }

    public function getPrerequis(): ?self { return $this->prerequis; }
    public function setPrerequis(?self $prerequis): static { $this->prerequis = $prerequis; return $this; }
}