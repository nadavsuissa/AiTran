document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const fileInput = document.getElementById('fileInput');
    const submitBtn = document.getElementById('submitBtn');
    const statusDiv = document.getElementById('status');
    const resultDiv = document.getElementById('result');
    const statusText = document.getElementById('statusText');
    
    if (!fileInput.files[0]) return;

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    // Reset UI
    submitBtn.disabled = true;
    statusDiv.classList.remove('hidden');
    resultDiv.classList.add('hidden');
    statusText.textContent = 'Uploading and analyzing... This may take a minute.';

    try {
        const response = await fetch('/api/process', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Something went wrong');
        }

        // Success
        document.getElementById('audioPlayer').src = data.downloadUrl;
        document.getElementById('downloadLink').href = data.downloadUrl;
        document.getElementById('scriptText').textContent = data.script;
        
        statusDiv.classList.add('hidden');
        resultDiv.classList.remove('hidden');
    } catch (error) {
        console.error(error);
        statusText.textContent = 'Error: ' + error.message;
        statusDiv.classList.remove('hidden'); // Show error
        document.querySelector('.loader').classList.add('hidden');
    } finally {
        submitBtn.disabled = false;
    }
});

