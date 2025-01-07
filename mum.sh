#!/bin/bash

if [[ $EUID -ne 0 ]]; then
    clear
    echo "You should run this script with root!"
    echo "Use sudo -i to change user to root"
    exit 1
fi
# Define the file path
env_file="/opt/marzban/.env"

function mum-setup {
    clear
    cd
    if [ -f "mum-bot/docker-compose.yml" ] && [ -f "mum-bot/docker-compose.override.yml" ]; then
        echo "mum-bot already installed."
        read -n 1 -s -r -p "Press any key to continue"
        return 0
    else
        apt-get update -y
        if ! command -v curl &> /dev/null; then
            apt-get install curl -y
        fi
        if ! command -v socat &> /dev/null; then
            apt-get install socat -y
        fi
        if ! command -v socat &> /dev/null; then
            apt-get install git -y
        fi           
        cd
        mkdir mum-bot
        cd mum-bot
        read -p "Enter your telegram bot token: " tbt
        read -p "Enter your telegram User ID: " tui
        #Creating a Docker Compose File
        cat <<EOF > docker-compose.yml
services:
  mum-bot:
    container_name: mum-bot
    image: ares11430/mum-bot:latest
    network_mode: host
    restart: always
    volumes:
      - ./data:/app/data
EOF
        # Extract the line containing SQLALCHEMY_DATABASE_URL
        db_url=$(grep 'SQLALCHEMY_DATABASE_URL=' "$env_file")
        # Extract the username and password using parameter expansion
        db_url=${db_url#*mysql+pymysql://} # Remove the prefix
        username=${db_url%%:*}             # Extract username before the colon
        temp=${db_url#*:}                  # Remove username and colon
        password=${temp%%@*}               # Extract password before the @ symbol
        #Creating an Override File for Environment Variables
        cat <<EOF > docker-compose.override.yml
services:
  mum-bot:
    environment:
      TELEGRAM_MUM_TOKEN: $tbt
      TELEGRAM_MUM_MAIN_ADMIN_ID: $tui
      MUM_DB_HOST: 127.0.0.1
      MUM_DB_USER: $username
      MUM_DB_PASSWORD: $password
      MUM_DB_NAME: marzban
      TZ: UTC
EOF
        docker compose up -d
    fi
}
function mum-logs {
    clear
    cd
    if [ ! -d "mum-bot" ]; then
        echo "the bot is not installed yet"
        read -n 1 -s -r -p "Press any key to continue"
    else
        cd mum-bot    
        docker compose logs -f
    fi      
}
function mum-restart {
    clear
      cd
    if [ ! -d "mum-bot" ]; then
        echo "the bot is not installed yet"
        read -n 1 -s -r -p "Press any key to continue"
    else
      cd mum-bot    
      docker compose stop
      docker compose up -d
    fi
}
function mum-stop {
    clear
    cd
    if [ ! -d "mum-bot" ]; then
        echo "the bot is not installed yet"
        read -n 1 -s -r -p "Press any key to continue"
    else
      cd mum-bot    
      docker compose stop
    fi
}
function mum-updatep {
    clear
    cd
    if [ ! -d "mum-bot" ]; then
        echo "the bot is not installed yet"
        read -n 1 -s -r -p "Press any key to continue"
    else
      cd mum-bot    
      docker compose down
      docker compose pull mum-bot
      docker compose up -d
    fi
}
function mum-config {
    clear
    cd
    if [ ! -d "mum-bot" ]; then
        echo "the bot is not installed yet"
        read -n 1 -s -r -p "Press any key to continue"
    else
      cd mum-bot    
      nano ./data/config.json
    fi
}
function mum-remove {
    clear
    cd
    if [ ! -d "mum-bot" ]; then
        echo "the bot is not installed yet"
        read -n 1 -s -r -p "Press any key to continue"
    else
        docker compose down -v
        rm -rf /mum-bot
    fi
}

while true; do
clear
    echo "MUM-Bot SetUp"
    echo "Menu:"
    echo "1  - Install the Bot"
    echo "2  - View Logs"
    echo "3  - Restart The Bot"
    echo "4  - Stop The Bot"
    echo "5  - Update The Bot"
    echo "6  - View and Edit the Config"
    echo "7  - Remove the mum-bot"
    echo "8  - Exit"
    read -p "Enter your choice: " choice
    case $choice in
        1) mum-setup;;
        2) mum-logs;;
        3) mum-restart;;
        4) mum-stop;;
        5) mum-updatep;;
        6) mum-config;;
        7) mum-remove;;
        8) echo "Exiting..."; exit;;
        *) echo "Invalid choice. Please enter a valid option.";;
    esac
done
    
