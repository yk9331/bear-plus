node { 
  stage('Clone'){
    sh 'docker exec -t bear-plus /bin/sh -c "git pull origin develop"'
  }
  stage('Build') {
    sh 'docker exec -t bear-plus /bin/sh -c "npm install"'
    sh 'docker exec -t bear-plus /bin/sh -c "npm run build"'
    sh 'docker exec -t bear-plus /bin/sh -c "npm install -g pm2"'
  }
  stage('Restart'){
    sh 'docker exec -t bear-plus /bin/sh -c "pm2 restart bear-plus;"'
  }
}
