node { 
  stage('Clone'){
    sh 'docker exec -t bear-plus /bin/sh -c "git pull origin develop"'
  }
  stage('Restart') {
    sh 'docker-compose restart --compatibility -d bear-plus'
  }
}
