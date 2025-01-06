# Marzban User Management (MUM) Bot

This bot helps **Marzban Admin Panel** users by providing details about expiring and low-traffic users. It supports **MySQL** as its database.

## Features

- **Admin Management**:
  - The main admin can manage settings, view all expiring users, and see all low-traffic users.
  - Additional admins can view their assigned users' details but cannot access other admins' user lists.
- **User Details and Info**:
  - Admins can see the traffic and expiration details of their assigned users.
  - To view their own user details, admins need to be added to the admin list.

---

## Prerequisites

1. **Install Docker and Docker Compose**: (Skip, If already installed)

   ```bash
   apt-get update && apt-get install curl socat git -y
   curl -fsSL https://get.docker.com | sh
   ```

2. **Get a Telegram Bot Token** from [@BotFather](https://core.telegram.org/bots#botfather).

3. **Retrieve Your Telegram User ID** using [@userinfobot](https://t.me/userinfobot).

4. **Obtain MySQL Database Credentials**:
   - Database Host
   - Username
   - Password
   - Database Name

---

## Configuration

1. **Create a Docker Compose File**:
   Create a `docker-compose.yml` file:

   ```bash
   mkdir mum-bot
   cd mum-bot
   nano docker-compose.yml
   ```

   Paste the following content:

   ```yaml
   services:
     mum-bot:
       container_name: mum-bot
       image: ares11430/mum-bot:latest
       network_mode: host
       restart: always
       volumes:
         - ./data:/app/data
   ```

2. **Create an Override File for Environment Variables**:
   Create a `docker-compose.override.yml` file:

   ```bash
   nano docker-compose.override.yml
   ```

   Paste the following content:

   ```yaml
   services:
     mum-bot:
       environment:
         TELEGRAM_MUM_TOKEN: <YOUR_TELEGRAM_BOT_TOKEN>
         TELEGRAM_MUM_MAIN_ADMIN_ID: <YOUR_TELEGRAM_USER_ID>
         MUM_DB_HOST: 127.0.0.1
         MUM_DB_USER: <DATABASE_USERNAME>
         MUM_DB_PASSWORD: <DATABASE_PASSWORD>
         MUM_DB_NAME: marzban
         TZ: UTC
   ```

   Replace the placeholder values with your actual credentials.

3. **Explanation of Variables**:
   - `TELEGRAM_MUM_TOKEN`: Telegram bot token obtained from BotFather.
   - `TELEGRAM_MUM_MAIN_ADMIN_ID`: Your Telegram user ID (main admin).
   - `MUM_DB_HOST`: Host address of the MySQL database (default is `127.0.0.1` for local setups).
   - `MUM_DB_USER`: MySQL database username.
   - `MUM_DB_PASSWORD`: MySQL database password.
   - `MUM_DB_NAME`: Name of the MySQL database.
   - `TZ`: Timezone for the bot (default is `UTC`, recommended to keep the default).

---

## Running the Bot

** At the root of the project **

1. Start the bot in detached mode:

   ```bash
   docker compose up -d
   ```

2. View logs to ensure everything is working:
   ```bash
   docker compose logs -f
   ```

---

## Stopping and Restarting the Bot

** At the root of the project **

1. **Stop the Bot**:

   ```bash
   docker compose down
   ```

2. **Restart the Bot**:
   ```bash
   docker compose up -d
   ```

---

## update to the latest version

1. Simply stop and start docker compose at the root of the project.

---

## Manual Configuration Updates

If you need to manually edit the bot's configuration file after deployment:

1. Access the container:

   ```bash
   docker exec -it mum-bot nano /app/data/config.json
   ```

2. Or edit the local configuration file directly:
   ```bash
   nano ./data/config.json
   ```

---

## Future Improvements

- Adding support for additional database systems.
- Expanding bot functionality beyond traffic and expiration management.

---

### License

This project is licensed under the MIT License.
