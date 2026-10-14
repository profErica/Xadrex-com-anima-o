/* som3.currentTime = 3; // Define o ponto inicial (segundo 3)

som3.play()
    .then(() => {
        setTimeout(() => {
            som3.pause();
            som3.currentTime = 0; // Opcional: reseta para o início do áudio
        }, 4000); // 4000ms = 4 segundos de duração (do 3 ao 7)
    })
    .catch((error) => {
        console.log("Erro ao reproduzir áudio:", error);
    }); */
    
export function tocarSomMovimento() {
    const som = new Audio('assets/movimento.mp3');
    som.play();
}

export function tocarSomCaptura() {
    const som = new Audio('assets/captura.mp3');
    som.play();
}
export function tocarSomRoque() {
    const som = new Audio('assets/roque.mp3');
    som.play();
}