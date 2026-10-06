// PM2 설정
// 반드시 fork 모드 + 인스턴스 1개로 실행한다.
// 실시간 대결 방(room) 상태를 메모리에 두기 때문에 cluster 모드로 여러 프로세스를 띄우면
// 방 정보가 프로세스마다 갈라져 버린다. (SQLite 쓰기 경합도 피할 수 있음)
module.exports = {
  apps: [
    {
      name: 'whereiam-server',
      script: 'dist/main.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
