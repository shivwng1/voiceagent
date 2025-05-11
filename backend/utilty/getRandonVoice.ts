export function getRandomVoice(): string {
    const indiaVoices = [
        'proplus-AdityaSharma',
        'proplus-Nishant',
        'proplus-Anaya',
        'proplus-Maya2',
        'proplus-Rajesh',
        'proplus-Neel',
        'proplus-Akanksha'
    ];

    // Get a random index
    const randomIndex = Math.floor(Math.random() * indiaVoices.length);

    // Get the random voice
    const selectedVoice = indiaVoices[randomIndex];

    // Log the selected voice to the console
    console.log(`==== Selected TTS Voice: ${selectedVoice} ====`);

    return selectedVoice;
}