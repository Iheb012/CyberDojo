# CyberDojo

Secure cybersecurity e-learning platform with a 2D browser game.
Symfony 7.4, Doctrine, Twig, AssetMapper, Stimulus, MariaDB/MySQL.

UI texts are in French; code and comments are in English.

## Requirements

- PHP 8.2.12 currently (see **PHP version** below)
- MariaDB 10.4+ or MySQL 8+
- Composer 2
- XAMPP for the local Apache/MariaDB stack (recommended)
- Docker is optional and only used for Mailpit by default

## PHP version

The project currently runs on **PHP 8.2.12** (Composer platform and runtime).
The specification targets **PHP 8.3**. PHP 8.2 security support ends in
**December 2026**.

Recommended action: upgrade XAMPP's PHP to 8.3 (or 8.4) before December 2026.
Symfony 7.4 supports PHP 8.2 to 8.4, and the code does not use 8.3-only syntax.
`composer.json` keeps `config.platform.php` at `8.2.12` so dependency resolution
matches the current runtime, while `require.php` is `>=8.2.12` so the upgrade
will not be blocked. After upgrading PHP, update both values and run
`composer update --lock`.

## Local setup (XAMPP)

1. Create the databases:

   ```sql
   CREATE DATABASE cyberdojo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE DATABASE cyberdojo_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

2. Create `.env.local` (ignored by git) with your local credentials:

   ```dotenv
   APP_SECRET=<generated-value>
   DATABASE_URL="mysql://root:@127.0.0.1:3306/cyberdojo?serverVersion=mariadb-10.4.32&charset=utf8mb4"
   ```

3. Generate `APP_SECRET`:

   ```powershell
   php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
   ```

4. Install dependencies and prepare the database:

   ```powershell
   composer install
   php bin/console doctrine:migrations:migrate
   php bin/console doctrine:fixtures:load
   ```

5. Open the application through the vhost described below.

### APP_SECRET rule

**Never commit a real `APP_SECRET`.** The committed `.env` contains only the
placeholder `change-me-in-env-local`. Put the real value in `.env.local`
(ignored by git) or in a real environment variable in production. The same rule
applies to database passwords, mail credentials and any future API key.

`.env.local` is listed in `.gitignore`; verify with:

```powershell
git check-ignore -v .env.local
git ls-files .env.local
```

The second command must print nothing.

## Database

The project uses **MariaDB/MySQL** everywhere:

- `.env` default: `mysql://app:!ChangeMe!@127.0.0.1:3306/cyberdojo`
- `.env.local`: your real local XAMPP credentials (ignored by git)
- `.env.test`: same server/database name; Doctrine appends `_test` automatically
- `compose.yaml`: optional MariaDB 10.11 container exposed on **3307** to avoid
  the XAMPP port 3306 conflict. If you use it, set `DATABASE_URL` to port 3307.

PostgreSQL references were removed.

## XAMPP vhost (DocumentRoot must point to `public/`)

Add this to `C:\xampp\apache\conf\extra\httpd-vhosts.conf`:

```apache
<VirtualHost *:80>
    ServerName cyberdojo.local
    DocumentRoot "C:/xampp/htdocs/cyberdojo/public"

    <Directory "C:/xampp/htdocs/cyberdojo/public">
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog "logs/cyberdojo-error.log"
    CustomLog "logs/cyberdojo-access.log" combined
</VirtualHost>
```

Then:

1. Ensure `Include conf/extra/httpd-vhosts.conf` is uncommented in
   `C:\xampp\apache\conf\httpd.conf`.
2. Add `127.0.0.1 cyberdojo.local` to
   `C:\Windows\System32\drivers\etc\hosts`.
3. Restart Apache.
4. Open `http://cyberdojo.local/`.

The project also ships a root `.htaccess` as defence in depth. It denies direct
access to `.env*`, `src/`, `config/`, `migrations/`, `tests/`, `var/`, `vendor/`,
`assets/`, `bin/`, `templates/`, `translations/`, `.git/`, `composer.json`,
`composer.lock`, `symfony.lock` and `phpunit.dist.xml` if Apache is mistakenly
configured with the project root as DocumentRoot. The real fix remains the
vhost above.

### Document exposure check

```powershell
curl.exe -i http://cyberdojo.local/.env
curl.exe -i http://cyberdojo.local/src
curl.exe -i http://cyberdojo.local/composer.json
curl.exe -i http://localhost/cyberdojo/.env
```

The first three must return **404 or 403**. The last one must return **403**
thanks to the root `.htaccess`; if it returns 200, Apache is serving the project
root and the vhost must be fixed.

## Security headers

`App\EventSubscriber\SecurityHeadersSubscriber` adds, on every main response:

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Permissions-Policy`
- `Strict-Transport-Security` only when `APP_ENV=prod` and the request is HTTPS

Production CSP:

```text
default-src 'self'; script-src 'self' 'nonce-<per-request>'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self' data:; connect-src 'self';
frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
```

`style-src` keeps `'unsafe-inline'` because Turbo's progress bar writes inline
styles through the CSSOM, which a nonce cannot cover. Scripts stay strict:
production never allows inline script without the per-request nonce.

Development CSP adds `'unsafe-inline' 'unsafe-eval'` to `script-src` for the
Symfony debug toolbar. Because browsers ignore `'unsafe-inline'` as soon as a
nonce is present, the dev policy deliberately omits the nonce; the toolbar
generates its own for its assets.

Asset loading is CSP-friendly:

- `importmap_polyfill` is disabled, so no CDN is loaded.
- CSS is linked from `base.html.twig` instead of being imported from `app.js`,
  so no `data:` script loader is needed.
- The import map and the entry-point script receive the per-request nonce.
- The FrankenPHP hot-reload CDN block was removed.

## Verification

```powershell
php -v
php bin/console --version
php bin/console debug:router
php bin/console lint:yaml config
php bin/console lint:twig templates
php bin/console lint:container
php bin/console asset-map:compile
```

HTTP checks:

```powershell
# Home page (new route)
curl.exe -i http://cyberdojo.local/

# Game page and API (API needs the database)
curl.exe -i http://cyberdojo.local/jeu
curl.exe -i http://cyberdojo.local/api/jeu/labs/dojo/objets

# Security headers
curl.exe -sI http://cyberdojo.local/ | Select-String -Pattern "Content-Security-Policy|X-Content-Type-Options|Referrer-Policy|X-Frame-Options|Permissions-Policy|Strict-Transport-Security"

# CSRF is still enforced on non-GET API calls
curl.exe -i -X POST http://cyberdojo.local/api/jeu/challenges/1/flag
```

Expected: `/` and `/jeu` return 200; the flag POST returns 403 without
`X-CSRF-Token`; CSP and the other headers are present; HSTS is absent in dev.

## Useful commands

```powershell
php bin/console cache:clear
php bin/console doctrine:schema:validate
php bin/console doctrine:migrations:status
php bin/console debug:config security
php bin/console debug:container limiter.flag_submission
vendor\bin\phpunit
```
