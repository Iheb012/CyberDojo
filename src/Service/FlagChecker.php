<?php

namespace App\Service;

use App\Entity\Challenge;

final class FlagChecker
{
    /** Flags are stored hashed, never in clear text. */
    public function hash(string $flag): string
    {
        return password_hash($flag, PASSWORD_DEFAULT);
    }

    public function check(Challenge $challenge, string $submitted): bool
    {
        return password_verify(trim($submitted), $challenge->getFlagHash());
    }
}