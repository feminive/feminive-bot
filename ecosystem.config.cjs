module.exports = {
  apps: [
    {
      name: 'feminive-bot',
      script: 'dist/bot.js',
      env: {
        NODE_ENV: 'production',
      },
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
}
