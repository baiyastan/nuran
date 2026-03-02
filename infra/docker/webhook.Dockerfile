# Webhook listener for GitHub deploy; needs docker CLI and git to run deploy on host via socket.
FROM almir/webhook:latest
RUN apk add --no-cache docker-cli docker-cli-compose git bash
# Hooks file and scripts are mounted at runtime from host repo (/var/www/nuran).
