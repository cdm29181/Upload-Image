document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const previewContainer = document.getElementById('previewContainer');
    const uploadBtn = document.getElementById('uploadBtn');
    const uploadStatus = document.getElementById('uploadStatus');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    // Xử lý sự kiện kéo thả
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drop-zone--over');
    });

    ['dragleave', 'dragend'].forEach(type => {
        dropZone.addEventListener(type, () => {
            dropZone.classList.remove('drop-zone--over');
        });
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drop-zone--over');
        const files = e.dataTransfer.files;
        if (files.length) {
            fileInput.files = files;
            updateImagePreviews(files);
        }
    });

    // Xử lý sự kiện click để chọn file
    dropZone.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', () => {
        updateImagePreviews(fileInput.files);
    });

    // Hiển thị preview ảnh
    function updateImagePreviews(files) {
        previewContainer.innerHTML = '';
        Array.from(files).forEach(file => {
            if (!file.type.startsWith('image/')) {
                showStatus('Chỉ chấp nhận file ảnh', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                const img = document.createElement('img');
                img.src = reader.result;
                img.classList.add('preview-image');
                previewContainer.appendChild(img);
            };
            reader.onerror = () => {
                showStatus('Không thể đọc file ảnh', 'error');
            };
            reader.readAsDataURL(file);
        });
    }

    // Hàm sleep helper
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Hàm upload với số lần thử lại
    async function uploadWithRetry(file, maxRetries = 5) {
        let attempt = 0;
        let backoffDelay = 1000; // Delay ban đầu 1 giây

        while (attempt < maxRetries) {
            try {
                const formData = new FormData();
                formData.append('file', file);

                const xhr = new XMLHttpRequest();
                xhr.open('POST', 'https://awsv3.namrx.xyz/api/upload', true);
                xhr.timeout = 30000; // Timeout 30 giây

                // Wrap XHR in a Promise
                const uploadPromise = new Promise((resolve, reject) => {
                    xhr.upload.onprogress = (e) => {
                        if (e.lengthComputable) {
                            const percentComplete = Math.round((e.loaded / e.total) * 100);
                            progressBar.style.width = percentComplete + '%';
                            progressText.textContent = percentComplete + '%';
                        }
                    };

                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            try {
                                const response = JSON.parse(xhr.responseText);
                                resolve(response);
                            } catch (error) {
                                reject(new Error('Invalid JSON response'));
                            }
                        } else {
                            // Phân loại lỗi để quyết định có retry hay không
                            const shouldRetry = [502, 503, 504].includes(xhr.status);
                            const error = new Error(`Upload failed: API returned status ${xhr.status}`);
                            error.shouldRetry = shouldRetry;
                            reject(error);
                        }
                    };

                    xhr.onerror = () => {
                        const error = new Error('Network error occurred');
                        error.shouldRetry = true;
                        reject(error);
                    };

                    xhr.ontimeout = () => {
                        const error = new Error('Upload timeout');
                        error.shouldRetry = true;
                        reject(error);
                    };
                });

                xhr.send(formData);
                const result = await uploadPromise;
                return result;

            } catch (error) {
                attempt++;
                console.error(`Lần thử ${attempt}/${maxRetries}:`, error);

                // Nếu không phải lỗi cần retry hoặc đã hết số lần thử
                if (!error.shouldRetry || attempt === maxRetries) {
                    throw error;
                }

                // Exponential backoff với jitter
                const jitter = Math.random() * 1000;
                const delay = backoffDelay + jitter;
                showStatus(`Đang thử lại lần ${attempt}/${maxRetries} sau ${Math.round(delay/1000)}s...`, 'warning');
                
                await sleep(delay);
                backoffDelay *= 2; // Tăng delay theo cấp số nhân
            }
        }
    }

    // Xử lý sự kiện upload
    uploadBtn.addEventListener('click', async () => {
        const files = fileInput.files;
        if (!files.length) {
            showStatus('Vui lòng chọn ít nhất một ảnh', 'error');
            return;
        }

        uploadBtn.disabled = true;
        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';
        progressText.textContent = '0%';

        // Xóa các thông báo cũ
        uploadStatus.innerHTML = '';
        
        try {
            const results = [];
            const totalFiles = files.length;
            
            // Tạo và hiển thị thông báo trạng thái chung
            const statusDiv = document.createElement('div');
            statusDiv.className = 'upload-status progress';
            statusDiv.textContent = 'Đang chuẩn bị tải lên...';
            uploadStatus.appendChild(statusDiv);

            for (let i = 0; i < totalFiles; i++) {
                const file = files[i];
                
                // Kiểm tra kích thước file
                if (file.size > 10 * 1024 * 1024) {
                    showStatus(`File "${file.name}" vượt quá 10MB`, 'error');
                    continue;
                }

                // Kiểm tra định dạng file
                if (!file.type.startsWith('image/')) {
                    showStatus(`File "${file.name}" không phải là ảnh`, 'error');
                    continue;
                }

                // Cập nhật thông báo trạng thái
                statusDiv.textContent = `Đang tải lên: ${i + 1}/${totalFiles}`;

                try {
                    const result = await uploadWithRetry(file);
                    if (result.finalUrl) {
                        results.push(result);
                        // Hiển thị URL của ảnh đã upload
                        const urlContainer = document.createElement('div');
                        urlContainer.className = 'url-container';
                        urlContainer.innerHTML = `
                            <div class="url-content">
                                <p>
                                    <strong>URL ảnh:</strong> 
                                    <a href="${result.finalUrl}" target="_blank">${result.finalUrl}</a>
                                    <button class="copy-btn" onclick="navigator.clipboard.writeText('${result.finalUrl}')">
                                        <i class="fas fa-copy"></i>
                                        <span>Copy</span>
                                    </button>
                                </p>
                            </div>
                            <div class="preview-section">
                                <img src="${result.finalUrl}" alt="Preview" class="url-preview">
                            </div>`;
                        uploadStatus.appendChild(urlContainer);
                    }
                } catch (error) {
                    showStatus(`Lỗi khi tải ảnh "${file.name}": ${error.message}`, 'error');
                }

                // Cập nhật progress tổng thể
                const progress = Math.round(((i + 1) / totalFiles) * 100);
                progressBar.style.width = `${progress}%`;
                progressText.textContent = `${progress}%`;
            }

            // Cập nhật thông báo cuối cùng
            if (results.length > 0) {
                statusDiv.textContent = `Đã tải lên thành công ${results.length}/${totalFiles} ảnh`;
                statusDiv.className = 'upload-status success';
            } else {
                statusDiv.textContent = 'Không có ảnh nào được tải lên thành công';
                statusDiv.className = 'upload-status error';
            }
        } catch (error) {
            console.error('Upload error:', error);
            showStatus(error.message || 'Có lỗi xảy ra khi upload', 'error');
        } finally {
            uploadBtn.disabled = false;
            setTimeout(() => {
                progressContainer.style.display = 'none';
            }, 1000);
        }
    });

    // Hiển thị trạng thái
    function showStatus(message, type = '') {
        const statusDiv = document.createElement('div');
        statusDiv.textContent = message;
        statusDiv.className = `upload-status ${type}`;
        uploadStatus.appendChild(statusDiv);
    }
});
