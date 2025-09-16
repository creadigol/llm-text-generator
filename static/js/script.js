document.addEventListener('DOMContentLoaded', () => {
    const websiteUrlInput = document.getElementById('websiteUrl');
    const generateBtn = document.getElementById('generateBtn');
    const outputSection = document.getElementById('outputSection');
    const outputIframe = document.getElementById('outputIframe');
    const statusMessage = document.getElementById('statusMessage');
    const copyBtn = document.getElementById('copyBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const clearBtn = document.getElementById('clearBtn');
    const copyMessage = document.getElementById('copyMessage');
    const processingOverlay = document.getElementById('processingOverlay');
    const processingDetail = document.getElementById('processingDetail');
    const progressBar = document.getElementById('progressBar');
    const processingPercent = document.getElementById('processingPercent');
    // Toggle buttons for output type selection
    const toggleButtons = document.querySelectorAll('.toggle-btn');
    const userDetailsModal = document.getElementById('userDetailsModal');
    const otpModal = document.getElementById('otpModal');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const otpModalCloseBtn = document.getElementById('otpModalCloseBtn');
    const userDetailsForm = document.getElementById('userDetailsForm');
    const otpForm = document.getElementById('otpForm');
    const resendOtpBtn = document.getElementById('resendOtpBtn');
    const otpEmailDisplay = document.getElementById('otpEmailDisplay');
    const otpInputs = document.querySelectorAll('.otp-input');

    // Global variables to track animation state
    let currentProgressAnimation = null;
    let currentProcessingState = false;
    let currentOutputContent = '';
    let userData = null;
    let pendingGenerationData = null;
    let selectedOutputType = 'llms_txt'; // Default output type

    // Smooth progress animation state
    let currentProgressValue = 0; // 0-100
    let targetProgressValue = 0;  // 0-100
    let progressAnimationFrame = null;
    let lastProgressBumpTs = 0;

    function setTargetProgress(percent) {
        targetProgressValue = Math.max(0, Math.min(100, percent));
        if (!progressAnimationFrame) {
            progressAnimationFrame = requestAnimationFrame(stepSmoothProgress);
        }
    }

    function stepSmoothProgress(timestamp) {
        // Easing towards target for fluent visual
        const delta = targetProgressValue - currentProgressValue;
        const step = Math.sign(delta) * Math.max(0.2, Math.abs(delta) * 0.15);
        if (Math.abs(delta) < 0.3) {
            currentProgressValue = targetProgressValue;
        } else {
            currentProgressValue += step;
        }
        const pctText = `${Math.round(currentProgressValue)}%`;
        progressBar.style.width = `${currentProgressValue.toFixed(1)}%`;
        if (processingPercent) processingPercent.textContent = pctText;

        // Gentle heartbeat when waiting (indeterminate feel), but cap below target
        if (currentProcessingState) {
            const now = performance.now();
            if (now - lastProgressBumpTs > 1800 && currentProgressValue < Math.min(targetProgressValue, 95)) {
                currentProgressValue = Math.min(currentProgressValue + 0.5, targetProgressValue);
                lastProgressBumpTs = now;
            }
        }

        if (currentProcessingState || Math.abs(targetProgressValue - currentProgressValue) > 0.1) {
            progressAnimationFrame = requestAnimationFrame(stepSmoothProgress);
        } else {
            cancelAnimationFrame(progressAnimationFrame);
            progressAnimationFrame = null;
        }
    }

    function startSmoothProgress(initial = 2) {
        currentProgressValue = 0;
        targetProgressValue = 0;
        lastProgressBumpTs = performance.now();
        progressBar.style.width = '0%';
        if (processingPercent) processingPercent.textContent = '0%';
        currentProcessingState = true;
        setTargetProgress(initial);
    }

    function completeSmoothProgress() {
        setTargetProgress(100);
        if (processingPercent) processingPercent.textContent = '100%';
        currentProcessingState = false;
    }

    // Session storage key for tracking visited tools
    const SESSION_STORAGE_KEY = 'util';
    const LLM_TOOL_KEY = '/llm-text-generator';

    // Cookie utility functions
    function deleteCookie(name) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    }

    function setCookie(name, value, days = 7) {
        if (name === 'inquiry_form_payload' || name === 'result_height') {
            // Session cookie (expires when browser closes)
            document.cookie = `${name}=${encodeURIComponent(JSON.stringify(value))};path=/`;
        } else {
            // Regular cookie with expiration
            const expires = new Date();
            expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
            document.cookie = `${name}=${encodeURIComponent(JSON.stringify(value))};expires=${expires.toUTCString()};path=/`;
        }
    }

    function getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) {
                try {
                    return JSON.parse(decodeURIComponent(c.substring(nameEQ.length, c.length)));
                } catch (e) {
                    return null;
                }
            }
        }
        return null;
    }

    // Function to get session storage data
    function getSessionStorage() {
        try {
            const data = sessionStorage.getItem(SESSION_STORAGE_KEY);
            if (data) {
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error reading session storage:', error);
        }
        // Return default structure if no data exists
        return { state: { visitedTools: [] }, version: 0 };
    }

    // Function to update session storage
    function updateSessionStorage(toolKey) {
        try {
            const data = getSessionStorage();
            if (!data.state.visitedTools.includes(toolKey)) {
                data.state.visitedTools.push(toolKey);
                sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
            }
        } catch (error) {
            console.error('Error updating session storage:', error);
        }
    }

    // Function to check if tool has been visited
    function isToolVisited(toolKey) {
        const data = getSessionStorage();
        return data.state.visitedTools.includes(toolKey);
    }

    // Function to initialize session storage on page load
    function initializeSessionStorage() {
        const data = getSessionStorage();
    }

    // Initialize result_height: always reset to 0 on page load
    function initializeResultHeightStorage() {
        setCookie('result_height', '0');
        localStorage.setItem('result_height', '0');
    }

    // Function to load saved iframe height (prefer cookie, fallback to localStorage)
    function loadIframeHeight() {
        const cookieVal = getCookie('result_height');
        const lsVal = localStorage.getItem('result_height');
        const result_height = (cookieVal !== null && cookieVal !== undefined) ? cookieVal : (lsVal !== null ? lsVal : '0');
        const numericHeight = parseInt(result_height, 10);
        // Honor 0 before any content is rendered; otherwise use stored value
        if (!isNaN(numericHeight) && numericHeight >= 0) {
            outputIframe.style.height = numericHeight + 'px';
        } else {
            outputIframe.style.height = '0px';
        }
    }

    // Function to save iframe height to both cookie (session) and localStorage
    function saveIframeHeight() {
        const result_height = outputIframe.offsetHeight;
        const value = String(result_height);
        setCookie('result_height', value); // Session cookie
        localStorage.setItem('result_height', value);
    }

    // Function to handle backdrop click
    function handleBackdropClick(e) {
        if (e.target === userDetailsModal) {
            hideUserDetailsModal();
        }
    }

    // Function to show user details modal
    function showUserDetailsModal() {
        if (!userDetailsModal) {
            console.error('userDetailsModal element not found!');
            return;
        }
        
        userDetailsModal.classList.add('show');
        document.body.style.overflow = 'hidden';
        
        // Add backdrop click handler
        userDetailsModal.addEventListener('click', handleBackdropClick);
    }

    // Function to hide user details modal
    function hideUserDetailsModal() {
        userDetailsModal.classList.remove('show');
        document.body.style.overflow = 'auto';
        
        // Remove backdrop click handler
        userDetailsModal.removeEventListener('click', handleBackdropClick);
    }

    // Function to show OTP modal
    function showOtpModal() {
        if (!otpModal) {
            console.error('otpModal element not found!');
            return;
        }
        
        // Clear OTP inputs
        otpInputs.forEach(input => input.value = '');
        // Focus first input
        otpInputs[0].focus();
        // Clear any previous OTP error/success message
        const otpError = document.getElementById('otpErrorMsg');
        if (otpError) {
            otpError.textContent = '';
            otpError.className = 'form-error';
        }
        
        otpModal.classList.add('show');
        document.body.style.overflow = 'hidden';
        
        // Add backdrop click handler
        otpModal.addEventListener('click', handleOtpBackdropClick);
    }

    // Function to hide OTP modal
    function hideOtpModal() {
        otpModal.classList.remove('show');
        document.body.style.overflow = 'auto';
        
        // Remove backdrop click handler
        otpModal.removeEventListener('click', handleOtpBackdropClick);
    }

    // Function to handle OTP backdrop click
    function handleOtpBackdropClick(e) {
        if (e.target === otpModal) {
            hideOtpModal();
        }
    }

    // Function to display content in iframe
    function displayContentInIframe(content) {
        currentOutputContent = content;
        
        // Create HTML content for iframe
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
                        font-size: 14px;
                        line-height: 1.6;
                        margin: 0;
                        padding: 0;
                        background: #f9fafb;
                        color: #374151;
                        white-space: pre-wrap;
                        word-wrap: break-word;
                    }
                    .content {
                        background: white;
                        padding: 10px;
                        border-radius: 8px;
                        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                        max-width: 100%;
                        overflow-x: auto;
                    }
                </style>
            </head>
            <body>
                <div class="content">${content.replace(/\n/g, '<br>').replace(/ /g, '&nbsp;')}</div>
            </body>
            </html>
        `;
        
        // Write content to iframe
        const iframeDoc = outputIframe.contentDocument || outputIframe.contentWindow.document;
        iframeDoc.open();
        iframeDoc.write(htmlContent);
        iframeDoc.close();
        
        // Show output section
        outputSection.style.display = 'block';
        
        // Load saved height
        loadIframeHeight();
        
        // Auto-adjust height based on content
        setTimeout(() => {
            const iframeBody = iframeDoc.body;
            if (iframeBody) {
                const result_height = iframeBody.scrollHeight;
                // Clamp height between 400px (min) and 600px (max)
                const newHeight = Math.max(400, Math.min(result_height + 40, 600));
                outputIframe.style.height = newHeight + 'px';
                saveIframeHeight();
            }
        }, 100);
    }

    // Function to validate URL
    function isValidUrl(string) {
        try {
            // Use the URL constructor for validation
            const url = new URL(string);
            // Check if protocol is http or https
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch (_) {
            return false;
        }
    }
    
    // Function to clear any existing progress animation
    function clearProgressAnimation() {
        if (currentProgressAnimation) {
            clearInterval(currentProgressAnimation);
            currentProgressAnimation = null;
        }
        // Also clear the legacy window.progressAnimation if it exists
        if (window.progressAnimation) {
            clearInterval(window.progressAnimation);
            window.progressAnimation = null;
        }
    }
    
    // Function to update processing state and UI
    function setProcessingState(isProcessing, detail = null) {
        // Prevent duplicate start, but allow false path to run to ensure overlay/UI reset
        if (currentProcessingState === isProcessing && isProcessing === true) {
            return;
        }
        
        currentProcessingState = isProcessing;
        
        if (isProcessing) {
            // Clear any existing progress animation first
            clearProgressAnimation();
            
            // Disable button and change text
            generateBtn.disabled = true;
            generateBtn.textContent = 'Processing...';
            generateBtn.classList.add('processing');
            
            // Clear previous output
            currentOutputContent = '';
            outputSection.style.display = 'none';
            
            // Show processing message
            statusMessage.textContent = 'Processing website content...';
            statusMessage.className = 'status-info';
            
            // Hide copy and download buttons and message while processing
            copyBtn.style.display = 'none';
            downloadBtn.style.display = 'none';
            copyMessage.style.display = 'none';
            
            // Reset stored iframe height for a fresh session
            setCookie('result_height', '0');
            localStorage.setItem('result_height', '0');
            outputIframe.style.height = '0px';

            // Show processing overlay with animation
            processingOverlay.classList.add('show');
            
            // Update detail text if provided
            if (detail) {
                processingDetail.textContent = detail;
            } else {
                processingDetail.textContent = 'This may take a few moments';
            }
            
            // Start smooth progress animation
            startSmoothProgress(3);
        } else {
            // Complete smooth progress and stop RAF immediately
            completeSmoothProgress();
            if (progressAnimationFrame) {
                cancelAnimationFrame(progressAnimationFrame);
                progressAnimationFrame = null;
            }
            
            // Reset button state
            generateBtn.disabled = false;
            generateBtn.textContent = 'Generate LLMs Txt';
            generateBtn.classList.remove('processing');
            
            // Hide processing overlay
            processingOverlay.classList.remove('show');
            
            // Reset progress bar and percent
            progressBar.style.width = '0%';
            if (processingPercent) processingPercent.textContent = '0%';
        }
    }
    
    // Function to animate the progress bar
    function startProgressAnimation() {
        // Clear any existing animation first
        clearProgressAnimation();
        
        // Reset progress
        progressBar.style.width = '0%';
        
        // Animate to 90% over 20 seconds (simulating progress)
        // The remaining 10% will be filled when the response is received
        let width = 0;
        const maxWidth = 90;
        const duration = 20000; // 20 seconds
        const interval = 200; // Update every 200ms
        const increment = (maxWidth * interval) / duration;
        
        currentProgressAnimation = setInterval(() => {
            if (width >= maxWidth) {
                clearProgressAnimation();
            } else {
                width += increment;
                progressBar.style.width = `${width}%`;
            }
        }, interval);
        
        // Also store in window for backward compatibility
        window.progressAnimation = currentProgressAnimation;
    }
    
    // Function to complete the progress animation
    function completeProgressAnimation() {
        // Clear any existing animation
        clearProgressAnimation();
        
        // Animate to 100%
        progressBar.style.width = '100%';
    }
    
    // Function to display error message
    function showError(message) {
        // Reset processing state first
        setProcessingState(false);
        
        // Show error message with modern styling
        statusMessage.textContent = `Error: ${message}`;
        statusMessage.className = 'status-message status-error';
        
        // Only show error in iframe for generation-related errors, not for validation/authentication errors
        if (!message.includes('OTP') && !message.includes('email') && !message.includes('verify') && 
            !message.includes('Invalid URL') && !message.includes('URL format') && 
            !message.includes('Please enter') && !message.includes('required')) {
            const errorContent = `An error occurred: ${message}\n\nPlease try again with a different URL or check your API key configuration.`;
            displayContentInIframe(errorContent);
        }
    }

    // Function to display success message
    function showSuccess(message) {
        statusMessage.textContent = message;
        statusMessage.className = 'status-message status-success';
    }

    generateBtn.addEventListener('click', async () => {
        const url = websiteUrlInput.value.trim();
        
        // Client-side URL validation
        if (!url) {
            showError('Please enter a website URL');
            return;
        }
        
        if (!isValidUrl(url)) {
            showError('Invalid URL format. URL must start with http:// or https://');
            return;
        }
        
        // If inquiry_form_payload cookie has an email, skip OTP
        const inquiryCookie = getCookie('inquiry_form_payload');
        const hasInquiryEmail = inquiryCookie && inquiryCookie.uEmail;
        if (hasInquiryEmail) {
            // Mark as visited for this session and proceed directly
            updateSessionStorage(LLM_TOOL_KEY);
            userData = null; // Do not send userData to bypass server OTP gate
            pendingGenerationData = {
                url: url,
                outputType: selectedOutputType
            };
            startGeneration();
            return;
        }

        // Check if user has already verified OTP for this tool (session flag)
        if (isToolVisited(LLM_TOOL_KEY)) {
            // User has already verified, proceed directly to generation
            pendingGenerationData = {
                url: url,
                outputType: selectedOutputType
            };
            startGeneration();
        } else {
            // User needs to verify OTP first
            pendingGenerationData = {
                url: url,
                outputType: selectedOutputType
            };
            
            // Show user details modal first
            showUserDetailsModal();
        }
    });

    // User details form submission
    userDetailsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(userDetailsForm);
        const name = formData.get('name');
        const email = formData.get('email');
        
        userData = { name, email };
        
        // Do NOT store inquiry cookie yet; only after OTP verification succeeds
        
        // Get the submit button and show loading state
        const submitBtn = userDetailsForm.querySelector('.submit-btn');
        const originalText = submitBtn.textContent;
        
        // Show loading state
        submitBtn.textContent = 'Please wait...';
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.7';
        
        try {
            // Send OTP request
            const response = await fetch('/send_otp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name, email })
            });
            
            if (response.ok) {
                // Display email in OTP modal
                otpEmailDisplay.textContent = email;
                hideUserDetailsModal();
                showOtpModal();
            } else {
                const errorData = await response.json();
                showError('Failed to send OTP: ' + (errorData.error || 'Unknown error'));
            }
        } catch (error) {
            showError('Failed to send OTP: ' + error.message);
        } finally {
            // Reset button state
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
        }
    });

    // OTP form submission
    otpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Collect OTP from individual input fields
        const otp = Array.from(otpInputs).map(input => input.value).join('');
        
        if (otp.length !== 6) {
            const otpError = document.getElementById('otpErrorMsg');
            if (otpError) {
                otpError.textContent = 'Please enter a complete 6-digit OTP';
            } else {
                showError('Please enter a complete 6-digit OTP');
            }
            return;
        }
        
        // Get the submit button and show loading state
        const submitBtn = otpForm.querySelector('.submit-btn');
        const originalText = submitBtn.textContent;
        
        // Show loading state
        submitBtn.textContent = 'Verifying...';
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.7';
        
        try {
            // Verify OTP
            const response = await fetch('/verify_otp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    email: userData.email, 
                    otp: otp 
                })
            });
            
            if (response.ok) {
                // Update session storage to mark tool as visited
                updateSessionStorage(LLM_TOOL_KEY);
                // Persist verified inquiry cookie now
                if (userData && userData.name && userData.email) {
                    const inquiryFormPayload = {
                        uName: userData.name,
                        uEmail: userData.email,
                        ToolTitle: 'llm-text-generator',
                        ToolSubmit: 'Send'
                    };
                    setCookie('inquiry_form_payload', inquiryFormPayload);
                }
                
                hideOtpModal();
                // Start generation process
                startGeneration();
            } else {
                const errorData = await response.json();
                const otpError = document.getElementById('otpErrorMsg');
                if (otpError) {
                    otpError.textContent = errorData.error || 'Invalid OTP. Please try again';
                } else {
                    showError('Invalid OTP: ' + (errorData.error || 'Please try again'));
                }
                // Ensure no stale inquiry cookie persists on failure
                deleteCookie('inquiry_form_payload');
            }
        } catch (error) {
            const otpError = document.getElementById('otpErrorMsg');
            if (otpError) {
                otpError.textContent = 'Failed to verify OTP: ' + error.message;
            } else {
                showError('Failed to verify OTP: ' + error.message);
            }
            // Ensure no stale inquiry cookie persists on error
            deleteCookie('inquiry_form_payload');
        } finally {
            // Reset button state
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
        }
    });

    // Resend OTP button
    resendOtpBtn.addEventListener('click', async () => {
        // Show loading state
        const originalText = resendOtpBtn.textContent;
        resendOtpBtn.textContent = 'Please wait...';
        resendOtpBtn.disabled = true;
        resendOtpBtn.style.opacity = '0.7';
        
        try {
            const response = await fetch('/send_otp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    name: userData.name, 
                    email: userData.email 
                })
            });
            
            if (response.ok) {
                const otpError = document.getElementById('otpErrorMsg');
                if (otpError) {
                    otpError.textContent = 'OTP resent successfully!';
                    otpError.className = 'form-success';
                }
            } else {
                const errorData = await response.json();
                const otpError = document.getElementById('otpErrorMsg');
                if (otpError) {
                    otpError.textContent = 'Failed to resend OTP: ' + (errorData.error || 'Unknown error');
                    otpError.className = 'form-error';
                } else {
                    showError('Failed to resend OTP: ' + (errorData.error || 'Unknown error'));
                }
            }
        } catch (error) {
            const otpError = document.getElementById('otpErrorMsg');
            if (otpError) {
                otpError.textContent = 'Failed to resend OTP: ' + error.message;
                otpError.className = 'form-error';
            } else {
                showError('Failed to resend OTP: ' + error.message);
            }
        } finally {
            // Reset button state
            resendOtpBtn.textContent = originalText;
            resendOtpBtn.disabled = false;
            resendOtpBtn.style.opacity = '1';
        }
    });

    // Modal close buttons
    modalCloseBtn.addEventListener('click', hideUserDetailsModal);
    otpModalCloseBtn.addEventListener('click', hideOtpModal);

    // Toggle button functionality for output type selection
    toggleButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons
            toggleButtons.forEach(btn => btn.classList.remove('active'));
            // Add active class to clicked button
            button.classList.add('active');
            // Update selected output type
            selectedOutputType = button.getAttribute('data-type');
            // Adjust download button label based on mode
            if (selectedOutputType === 'llms_both') {
                downloadBtn.textContent = 'Download zip file';
            } else {
                downloadBtn.textContent = 'Download text file';
            }
        });
    });

    // OTP input functionality
    otpInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            const value = e.target.value;
            
            // Only allow numbers
            if (!/^\d*$/.test(value)) {
                e.target.value = '';
                return;
            }
            
            // Move to next input if current is filled
            if (value && index < otpInputs.length - 1) {
                otpInputs[index + 1].focus();
            }
        });
        
        input.addEventListener('keydown', (e) => {
            // Move to previous input on backspace if current is empty
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                otpInputs[index - 1].focus();
            }
        });
        
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pastedData = e.clipboardData.getData('text').replace(/\D/g, '');
            if (pastedData.length === 6) {
                pastedData.split('').forEach((digit, i) => {
                    if (otpInputs[i]) {
                        otpInputs[i].value = digit;
                    }
                });
                otpInputs[5].focus();
            }
        });
    });

    // Function to start generation after OTP verification (batched, short requests)
    async function startGeneration() {
        if (!pendingGenerationData) return;
        
        const { url, outputType } = pendingGenerationData;
        
        // Set UI to processing state
        setProcessingState(true, 'Preparing...');

        try {
            // Prepare job
            const prepResp = await fetch('/prepare_generation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    websiteUrl: url,
                    outputType: outputType,
                    userData: userData
                })
            });

            if (!prepResp.ok) {
                const err = await prepResp.json().catch(() => ({}));
                showError(err.error || 'Failed to prepare generation');
                return;
            }

            const { job_id, total } = await prepResp.json();

            // Process in batches
            startSmoothProgress(5);
            let processed = 0;
            const batchSize = 10;
            processingDetail.textContent = `Processing 0/${total} links...`;

            while (processed < total && currentProcessingState) {
                const resp = await fetch('/process_batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ job_id: job_id, start: processed, size: batchSize })
                });
                if (!resp.ok) {
                    const err = await resp.json().catch(() => ({}));
                    showError(err.error || 'Batch failed');
                    setProcessingState(false);
                    return;
                }
                const data = await resp.json();
                processed = data.processed;
                const pct = total ? Math.max(0, Math.min(100, Math.floor((processed / total) * 96))) : 50;
                setTargetProgress(pct);
                processingDetail.textContent = `Processing ${processed}/${total} links...`;
            }

            // Finalize
            processingDetail.textContent = 'Finalizing results...';
            const finalResp = await fetch(`/finalize/${job_id}`);
            if (!finalResp.ok) {
                const err = await finalResp.json().catch(() => ({}));
                showError(err.error || 'Failed to finalize results');
                setProcessingState(false);
                return;
            }
            const result = await finalResp.json();
            completeSmoothProgress();
            setProcessingState(false);
            if (result.is_zip_mode) {
                const zipData = result.zip_data;
                const zipBytes = new Uint8Array(zipData.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
                window.storedZipBlob = new Blob([zipBytes], { type: 'application/zip' });
                const combinedOutput = `=== SUMMARIZED CONTENT ===\n\n${result.llms_text}\n\n=== FULL TEXT CONTENT ===\n\n${result.llms_full_text}`;
                displayContentInIframe(combinedOutput);
                statusMessage.textContent = 'Both LLM Text and Full Text generated successfully! Click download to get the zip file with separate .txt files.';
                statusMessage.className = 'status-message status-success';
                downloadBtn.textContent = 'Download zip file';
            } else if (result.llms_text) {
                displayContentInIframe(result.llms_text);
                statusMessage.textContent = 'LLM Text generated successfully!';
                statusMessage.className = 'status-message status-success';
                downloadBtn.textContent = 'Download text file';
            } else if (result.llms_full_text) {
                displayContentInIframe(result.llms_full_text);
                statusMessage.textContent = 'LLM Full Text generated successfully!';
                statusMessage.className = 'status-message status-success';
                downloadBtn.textContent = 'Download text file';
            } else {
                showError('Unexpected result format');
            }
            copyBtn.style.display = 'inline-block';
            downloadBtn.style.display = 'inline-block';

        } catch (error) {
            console.error('Error:', error);
            showError(error.message);
            setProcessingState(false);
        }
    }
    
    // Implement copy to clipboard functionality
    copyBtn.addEventListener('click', () => {
        if (!currentOutputContent) {
            return;
        }
        
        try {
            // Use the modern clipboard API if available
            if (navigator.clipboard) {
                navigator.clipboard.writeText(currentOutputContent)
                    .then(() => showCopySuccess())
                    .catch(err => {
                        console.error('Failed to copy: ', err);
                        // Fallback to older method on error
                        const textArea = document.createElement('textarea');
                        textArea.value = currentOutputContent;
                        document.body.appendChild(textArea);
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);
                        showCopySuccess();
                    });
            } else {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = currentOutputContent;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                showCopySuccess();
            }
        } catch (err) {
            console.error('Copy error:', err);
        }
    });
    
    // Implement download text file functionality
    downloadBtn.addEventListener('click', () => {
        if (!currentOutputContent) {
            return;
        }
        
        // Use the global selectedOutputType variable
        // const selectedOutputType = document.querySelector('input[name="outputType"]:checked').value;
        
        // For both mode, use the stored zip blob
        if (selectedOutputType === 'llms_both') {
            if (window.storedZipBlob) {
                // Download the stored zip file
                const downloadUrl = window.URL.createObjectURL(window.storedZipBlob);
                const downloadLink = document.createElement('a');
                downloadLink.href = downloadUrl;
                downloadLink.download = 'llms-both.zip';
                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);
                window.URL.revokeObjectURL(downloadUrl);
                
                statusMessage.textContent = 'Zip download started.';
                statusMessage.className = 'status-message status-success';
            } else {
                showError('No zip file available. Please generate content first.');
            }
            return;
        }
        
        // For other modes, download as text file
        let filename = 'llms.txt'; // default
        if (selectedOutputType === 'llms_full_txt') {
            filename = 'llms-full.txt';
        }
        
        // Create a blob with the text content
        const blob = new Blob([currentOutputContent], { type: 'text/plain' });
        
        // Create a temporary URL for the blob
        const url = window.URL.createObjectURL(blob);
        
        // Create a temporary anchor element to trigger download
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = filename; // Set the dynamic filename
        
        // Append to body, click, and remove
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        
        // Clean up the URL object
        window.URL.revokeObjectURL(url);
    });
    
    // Implement clear functionality
    clearBtn.addEventListener('click', () => {
        // Clear any existing progress animation
        clearProgressAnimation();
        
        // Reset processing state
        currentProcessingState = false;
        
        // Clear the URL input
        websiteUrlInput.value = '';
        
        // Clear the output content and hide section
        currentOutputContent = '';
        outputSection.style.display = 'none';
        
        // Clear status message
        statusMessage.textContent = '';
        statusMessage.className = '';
        
        // Clear stored zip blob
        window.storedZipBlob = null;
        
        // Hide copy and download buttons
        copyBtn.style.display = 'none';
        downloadBtn.style.display = 'none';
        copyMessage.style.display = 'none';
        
        // Reset saved iframe height and collapse iframe
        setCookie('result_height', '0');
        localStorage.setItem('result_height', '0');
        outputIframe.style.height = '0px';
        
        // Reset to default output type (summarized)
        selectedOutputType = 'llms_txt';
        toggleButtons.forEach(btn => btn.classList.remove('active'));
        toggleButtons[0].classList.add('active'); // First button (LLMs Txt)
        
        // Focus back to the URL input for better UX
        websiteUrlInput.focus();
    });
    
    function showCopySuccess() {
        // Show copy success message
        copyMessage.style.display = 'inline';
        copyMessage.style.opacity = 1;
        
        // Reset animation by removing and re-adding the element
        copyMessage.style.animation = 'none';
        void copyMessage.offsetWidth; // Trigger reflow
        copyMessage.style.animation = 'fadeOut 2s forwards';
        copyMessage.style.animationDelay = '1s';
        
        // Hide after animation completes
        setTimeout(() => {
            copyMessage.style.display = 'none';
        }, 3000);
    }
    
    // Add iframe resize handler
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (outputSection.style.display !== 'none') {
                saveIframeHeight();
            }
        }, 250);
    });
    
    // Cleanup function to handle page unload
    window.addEventListener('beforeunload', () => {
        clearProgressAnimation();
        saveIframeHeight();
    });
    
    // Also cleanup on page visibility change (when user switches tabs)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // Page is hidden, we could pause animations here if needed
        } else {
            // Page is visible again, ensure animations are in sync
            if (!currentProcessingState) {
                clearProgressAnimation();
            }
        }
    });

    // Function to pre-fill form with cookie data
    function prefillFormFromCookie() {
        const cookieData = getCookie('inquiry_form_payload');
        if (cookieData && cookieData.uName && cookieData.uEmail) {
            const nameInput = document.getElementById('formName');
            const emailInput = document.getElementById('formEmail');
            
            if (nameInput && emailInput) {
                nameInput.value = cookieData.uName;
                emailInput.value = cookieData.uEmail;
            }
        }
    }

    // Initialize session/local storage for result_height, session storage, and pre-fill form
    initializeResultHeightStorage();
    initializeSessionStorage();
    prefillFormFromCookie();
}); 