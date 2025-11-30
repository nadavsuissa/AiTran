document.addEventListener('DOMContentLoaded', () => {
    // --- Mobile Menu Toggle ---
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileMenu = document.getElementById('mobileMenu');

    mobileMenuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('active');
        const icon = mobileMenuBtn.querySelector('i');
        icon.classList.toggle('fa-bars');
        icon.classList.toggle('fa-xmark');
    });

    // Close mobile menu when clicking on a link
    document.querySelectorAll('.mobile-nav-link').forEach(link => {
        link.addEventListener('click', () => {
            mobileMenu.classList.remove('active');
            const icon = mobileMenuBtn.querySelector('i');
            icon.classList.add('fa-bars');
            icon.classList.remove('fa-xmark');
        });
    });

    // --- File Processing Elements ---
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('drop-zone');
    const generateBtn = document.getElementById('generateBtn');
    const fileInfo = document.getElementById('file-info');
    const filenameSpan = document.getElementById('filename');
    const removeFileBtn = document.getElementById('removeFileBtn');
    const statusContainer = document.getElementById('status-container');
    const statusText = document.getElementById('status-text');
    const resultSection = document.getElementById('result-section');
    const audioPlayer = document.getElementById('audioPlayer');
    const downloadLink = document.getElementById('downloadLink');
    const toggleScriptBtn = document.getElementById('toggleScriptBtn');
    const scriptContainer = document.getElementById('scriptContainer');
    const scriptText = document.getElementById('scriptText');

    let currentFile = null;

    // --- Drag & Drop & File Selection ---

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) {
            handleFileSelect(fileInput.files[0]);
        }
    });

    function handleFileSelect(file) {
        // Validate file type (basic check)
        const validTypes = ['.pdf', '.docx', '.pptx', '.xlsx', '.xls', '.ppt'];
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        
        if (!validTypes.includes(ext)) {
            alert('נא להעלות קובץ תקין (PDF, Word, PowerPoint, Excel).');
            return;
        }

        currentFile = file;
        filenameSpan.textContent = file.name;
        
        // Update UI
        dropZone.querySelector('.icon-container').classList.add('hidden');
        dropZone.querySelector('h3').classList.add('hidden');
        dropZone.querySelector('.supported-files').classList.add('hidden');
        
        fileInfo.classList.remove('hidden');
        generateBtn.disabled = false;
    }

    removeFileBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering dropZone click
        currentFile = null;
        fileInput.value = ''; // Reset input
        
        // Reset UI
        fileInfo.classList.add('hidden');
        dropZone.querySelector('.icon-container').classList.remove('hidden');
        dropZone.querySelector('h3').classList.remove('hidden');
        dropZone.querySelector('.supported-files').classList.remove('hidden');
        generateBtn.disabled = true;
    });

    // --- Submission ---

    generateBtn.addEventListener('click', async () => {
        if (!currentFile) return;

        // UI State: Loading
        generateBtn.disabled = true;
        generateBtn.classList.add('hidden');
        statusContainer.classList.remove('hidden');
        resultSection.classList.add('hidden');
        
        // Create FormData
        const formData = new FormData();
        formData.append('file', currentFile);

        try {
            statusText.textContent = "מעלה את הקובץ...";
            
            const response = await fetch('/api/process', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Processing failed');
            }

            statusText.textContent = "יוצר הרצאה (זה עשוי לקחת מעט זמן)...";
            const data = await response.json();

            // Success UI
            statusContainer.classList.add('hidden');
            showResult(data);

        } catch (error) {
            console.error(error);
            statusText.textContent = `שגיאה: ${error.message}`;
            statusText.style.color = "#ef4444";
            document.querySelector('.loader').classList.add('hidden');
            
            setTimeout(() => {
                generateBtn.classList.remove('hidden');
                generateBtn.disabled = false;
                statusText.style.color = "";
                statusText.textContent = "מעבד את הקובץ...";
                document.querySelector('.loader').classList.remove('hidden');
                statusContainer.classList.add('hidden');
            }, 4000);
        }
    });

    function showResult(data) {
        resultSection.classList.remove('hidden');
        
        // Set Audio
        audioPlayer.src = data.downloadUrl;
        audioPlayer.load(); // Ensure it loads
        
        // Set Download Link
        downloadLink.href = data.downloadUrl;
        
        // Set Script
        scriptText.textContent = data.script;

        // Reset Generate Button for next time
        generateBtn.classList.remove('hidden');
        generateBtn.querySelector('span').textContent = "צור הרצאה חדשה";
        generateBtn.disabled = false;
    }

    // --- Script Toggle ---
    
    toggleScriptBtn.addEventListener('click', () => {
        scriptContainer.classList.toggle('hidden');
        const isHidden = scriptContainer.classList.contains('hidden');
        const span = toggleScriptBtn.querySelector('span');
        const icon = toggleScriptBtn.querySelector('i');
        
        if (isHidden) {
            span.textContent = 'הצג תמלול';
            icon.className = 'fa-solid fa-align-right';
        } else {
            span.textContent = 'הסתר תמלול';
            icon.className = 'fa-solid fa-chevron-up';
        }
    });
});
