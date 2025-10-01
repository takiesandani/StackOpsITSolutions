document.addEventListener('DOMContentLoaded', () => {

    // --- Voice Note Recording ---
    const startRecordBtn = document.getElementById('start-record-btn');
    const stopRecordBtn = document.getElementById('stop-record-btn');
    const voiceNotePreview = document.getElementById('voice-note-preview');

    let mediaRecorder;
    let audioChunks = [];

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        startRecordBtn.addEventListener('click', () => {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    mediaRecorder = new MediaRecorder(stream);
                    mediaRecorder.start();

                    startRecordBtn.disabled = true;
                    stopRecordBtn.disabled = false;
                    voiceNotePreview.src = '';
                    voiceNotePreview.controls = false;

                    mediaRecorder.ondataavailable = event => {
                        audioChunks.push(event.data);
                    };

                    mediaRecorder.onstop = () => {
                        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                        const audioUrl = URL.createObjectURL(audioBlob);
                        voiceNotePreview.src = audioUrl;
                        voiceNotePreview.controls = true;
                        audioChunks = [];
                    };
                })
                .catch(err => {
                    console.error('Error accessing microphone:', err);
                    alert('Could not access microphone. Please ensure permissions are granted.');
                });
        });

        stopRecordBtn.addEventListener('click', () => {
            if (mediaRecorder) {
                mediaRecorder.stop();
                startRecordBtn.disabled = false;
                stopRecordBtn.disabled = true;
            }
        });
    } else {
        alert('Your browser does not support audio recording.');
        startRecordBtn.disabled = true;
        stopRecordBtn.disabled = true;
    }

    // --- Video and Image Previews ---
    const videoUpload = document.getElementById('video-upload');
    const videoPreview = document.getElementById('video-preview');

    videoUpload.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const videoUrl = URL.createObjectURL(file);
            videoPreview.src = videoUrl;
            videoPreview.style.display = 'block';
        }
    });

    const imageUpload = document.getElementById('image-upload');
    const authorImage = document.querySelector('.testimonial-card .author-info img');

    imageUpload.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const imageUrl = URL.createObjectURL(file);
            authorImage.src = imageUrl;
        }
    });
});