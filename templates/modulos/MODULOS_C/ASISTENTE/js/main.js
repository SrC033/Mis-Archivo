// ============================================================
// ASISTENTE ALFA - Lógica (solo se activa en asistente.html)
// ============================================================
(function() {
    if (!document.body.classList.contains('assistant-body')) return;

    console.log('✅ Iniciando Asistente ALFA...');

    // ========== ELEMENTOS ==========
    const cloudDialog = document.getElementById('cloudDialog');
    const dialogHistory = document.getElementById('dialogHistory');
    const logoG = document.getElementById('logoG');
    const logoBody = document.getElementById('logoBody');
    const logoVideo = document.getElementById('logoVideo');
    const connectionStatus = document.getElementById('connectionStatus');
    const dialogStatusDot = document.getElementById('dialogStatusDot');
    const dialogBadge = document.getElementById('dialogBadge');
    const micBtn = document.getElementById('micBtn');
    const clearBtn = document.getElementById('clearBtn');
    const audioBtn = document.getElementById('audioBtn');
    const inputBar = document.getElementById('inputBar');
    const inputTexto = document.getElementById('inputTexto');
    const btnSend = document.getElementById('btnSend');

    if (!cloudDialog || !logoG) return;

    // ========== ESTADO ==========
    let assistantActive = false;
    let isTyping = false;
    let isProcessing = false;
    let serverPort = 5996;
    let serverOnline = false;
    let messageHistory = [];
    let inputVisible = false;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    let recognition = null;
    let micActive = false;
    let isListening = false;

    // ========== VOZ ==========
    const speechSynth = window.speechSynthesis;
    let isSpeaking = false;
    let currentUtterance = null;
    let voiceActive = true;
    let selectedVoice = null;

    // ============================================================
    // UTILIDADES
    // ============================================================
    function getServerPort() { return serverPort; }
    function getServerUrl() { return `http://127.0.0.1:${getServerPort()}`; }

    function notifyParent(type, data) {
        if (window.parent && window.parent !== window) {
            try {
                window.parent.postMessage(Object.assign({ type }, data), '*');
                return true;
            } catch (e) { return false; }
        }
        return false;
    }

    function scrollToBottom() {
        setTimeout(() => {
            if (dialogHistory) dialogHistory.scrollTop = dialogHistory.scrollHeight;
        }, 50);
    }

    function getCurrentTime() { return new Date(); }

    function updateConnectionUI(online) {
        serverOnline = online;
        if (connectionStatus) {
            connectionStatus.className = 'connection-status ' + (online ? 'online' : 'offline');
            connectionStatus.title = online ? 'Conectado' : 'Desconectado';
        }
        if (dialogStatusDot) dialogStatusDot.classList.toggle('online', online);
        if (dialogBadge) {
            dialogBadge.textContent = online ? 'ONLINE' : 'OFFLINE';
            dialogBadge.classList.toggle('online', online);
        }
    }

    // ============================================================
    // VOZ
    // ============================================================
    function selectFemaleVoice(voices) {
        const femaleVoiceNames = [
            'Google español', 'Google español (España)', 'Google español (México)',
            'Microsoft Elena', 'Microsoft Sabina', 'Microsoft Paulina',
            'Samantha', 'Mónica', 'Carmen'
        ];
        for (const voiceName of femaleVoiceNames) {
            const found = voices.find(v => v.name === voiceName || v.name.includes(voiceName));
            if (found) return found;
        }
        const spanish = voices.filter(v => v.lang.startsWith('es'));
        return spanish[0] || null;
    }

    function loadFemaleVoice() {
        const voices = speechSynth.getVoices();
        if (voices.length > 0) { selectedVoice = selectFemaleVoice(voices); return; }
        speechSynth.onvoiceschanged = function() {
            selectedVoice = selectFemaleVoice(speechSynth.getVoices());
        };
        setTimeout(() => {
            if (!selectedVoice) selectedVoice = selectFemaleVoice(speechSynth.getVoices());
        }, 3000);
    }

    function speakText(text) {
        if (!text || text.trim() === '' || !voiceActive) return;
        let cleanText = text.replace(/[🤖👤❌⚠️⏳📊🔵🔴🛢️💰💵📈📋📦🔊🎤]/g, '').replace(/\|/g, '').replace(/[*_]/g, '').replace(/\s+/g, ' ').trim();
        if (!cleanText) return;
        if (isSpeaking) { speechSynth.cancel(); isSpeaking = false; }
        try {
            currentUtterance = new SpeechSynthesisUtterance(cleanText);
            currentUtterance.lang = 'es-ES';
            currentUtterance.rate = 0.85;
            currentUtterance.pitch = 1.0;
            currentUtterance.volume = 1.0;
            if (selectedVoice) currentUtterance.voice = selectedVoice;
            isSpeaking = true;
            currentUtterance.onend = () => { isSpeaking = false; currentUtterance = null; };
            currentUtterance.onerror = () => { isSpeaking = false; currentUtterance = null; };
            speechSynth.speak(currentUtterance);
        } catch (error) { isSpeaking = false; currentUtterance = null; }
    }

    function stopSpeaking() {
        if (speechSynth && speechSynth.speaking) speechSynth.cancel();
        isSpeaking = false; currentUtterance = null;
    }

    // ============================================================
    // MENSAJES
    // ============================================================
    function addMessageToHistory(text, isUser, isError, time) {
        const now = time || new Date();
        const timeStr = now.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' });
        const welcomeMsg = dialogHistory.querySelector('.welcome');
        if (welcomeMsg && messageHistory.length === 0) welcomeMsg.remove();

        const messageDiv = document.createElement('div');
        let className = `dialog-message ${isUser ? 'user' : 'bot'}`;
        if (isError) className += ' error';
        messageDiv.className = className;
        const label = isUser ? 'Tu' : (isError ? 'Error' : 'Asistente');
        const textColor = isError ? 'color: #ff5470;' : '';
        messageDiv.innerHTML = `
            <span class="msg-label">${label}</span>
            <div class="msg-text" style="${textColor}">${text}</div>
            <span class="msg-time">${timeStr}</span>
        `;
        dialogHistory.appendChild(messageDiv);
        messageHistory.push({ text, isUser, isError, time: timeStr });
        scrollToBottom();
        if (!cloudDialog.classList.contains('active')) cloudDialog.classList.add('active');
    }

    function addMessageWithTyping(text, isUser, isError, time) {
        const now = time || new Date();
        const timeStr = now.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' });
        const welcomeMsg = dialogHistory.querySelector('.welcome');
        if (welcomeMsg && messageHistory.length === 0) welcomeMsg.remove();

        const messageDiv = document.createElement('div');
        let className = `dialog-message ${isUser ? 'user' : 'bot'}`;
        if (isError) className += ' error';
        messageDiv.className = className;
        const label = isUser ? 'Tu' : (isError ? 'Error' : 'Asistente');
        const textColor = isError ? 'color: #ff5470;' : '';
        messageDiv.innerHTML = `
            <span class="msg-label">${label}</span>
            <div class="msg-text" style="${textColor}"><span class="typing-content"></span><span class="typing-cursor"></span></div>
            <span class="msg-time">${timeStr}</span>
        `;
        dialogHistory.appendChild(messageDiv);
        messageHistory.push({ text, isUser, isError, time: timeStr });
        if (!cloudDialog.classList.contains('active')) cloudDialog.classList.add('active');

        const contentElement = messageDiv.querySelector('.typing-content');
        scrollToBottom();

        if (!isUser && !isError && voiceActive) setTimeout(() => speakText(text), 100);

        let index = 0;
        const chars = text.split('');
        const totalChars = chars.length;
        const delay = totalChars < 20 ? 8 : 15;

        if (window._alfatypeInterval) { clearTimeout(window._alfatypeInterval); window._alfatypeInterval = null; }

        const typeChar = () => {
            if (index < totalChars) {
                contentElement.textContent += chars[index];
                index++;
                scrollToBottom();
                window._alfatypeInterval = setTimeout(typeChar, delay);
            } else {
                const cursor = messageDiv.querySelector('.typing-cursor');
                if (cursor) cursor.style.display = 'none';
                scrollToBottom();
                if (window._alfatypeInterval) { clearTimeout(window._alfatypeInterval); window._alfatypeInterval = null; }
            }
        };
        window._alfatypeInterval = setTimeout(typeChar, 100);
    }

    function showTypingIndicator() {
        isTyping = true;
        const typingDiv = document.createElement('div');
        typingDiv.className = 'dialog-message bot';
        typingDiv.id = 'typingIndicator';
        typingDiv.innerHTML = `
            <span class="msg-label">Asistente</span>
            <div class="typing-indicator-wrapper">
                <div class="typing-dots"><span></span><span></span><span></span></div>
                <span class="typing-label-fixed">Procesando...</span>
            </div>
        `;
        dialogHistory.appendChild(typingDiv);
        scrollToBottom();
        if (!cloudDialog.classList.contains('active')) cloudDialog.classList.add('active');
    }

    function hideTypingIndicator() {
        const typing = document.getElementById('typingIndicator');
        if (typing) typing.remove();
        isTyping = false;
        scrollToBottom();
    }

    // ============================================================
    // LIMPIAR CHAT
    // ============================================================
    function limpiarChat() {
        stopSpeaking();
        dialogHistory.innerHTML = '';
        messageHistory = [];
        const welcomeDiv = document.createElement('div');
        welcomeDiv.className = 'dialog-message welcome';
        welcomeDiv.innerHTML = `
            <svg class="welcome-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span>Chat limpiado. Haz clic en el logo para hablar</span>
        `;
        dialogHistory.appendChild(welcomeDiv);
        notifyParent('CHAT_CLEARED', { timestamp: Date.now() });
        scrollToBottom();
    }

    // ============================================================
    // MICRÓFONO
    // ============================================================
    function initVoiceRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            micBtn.style.opacity = '0.4';
            micBtn.title = 'Voz no disponible';
            return;
        }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.lang = 'es-ES';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 3;

        recognition.onstart = () => {
            isListening = true;
            micBtn.classList.add('mic-on');
        };
        recognition.onend = () => {
            if (micActive) {
                try { recognition.start(); } catch(e) {
                    setTimeout(() => { if (micActive) try { recognition.start(); } catch(e2) {} }, 500);
                }
            } else {
                isListening = false;
                micBtn.classList.remove('mic-on');
            }
        };
        recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
                else interimTranscript += event.results[i][0].transcript;
            }
            if (interimTranscript) inputTexto.value = interimTranscript;
            if (finalTranscript && finalTranscript.trim() !== '') {
                inputTexto.value = '';
                procesarMensaje(finalTranscript.trim());
            }
        };
        recognition.onerror = (event) => {
            if (event.error === 'not-allowed' || event.error === 'audio-capture') {
                micActive = false; isListening = false;
                micBtn.classList.remove('mic-on');
            }
        };
    }

    function toggleMic() {
        if (!recognition) {
            alert('El reconocimiento de voz no está disponible en este navegador.');
            return;
        }
        if (!assistantActive) {
            toggleAsistente();
            setTimeout(() => {
                if (assistantActive) {
                    micActive = true;
                    try { recognition.start(); micBtn.classList.add('mic-on'); } catch(e) { micActive = false; }
                }
            }, 500);
            return;
        }
        if (micActive) {
            micActive = false;
            if (isListening) try { recognition.stop(); } catch(e) {}
            isListening = false;
            micBtn.classList.remove('mic-on');
        } else {
            micActive = true;
            try { recognition.start(); micBtn.classList.add('mic-on'); } catch(e) {
                micActive = false;
                micBtn.classList.remove('mic-on');
            }
        }
    }

    // ============================================================
    // INPUT
    // ============================================================
    function toggleInput() {
        if (isProcessing || isTyping) return;
        if (inputVisible) {
            inputBar.classList.remove('active');
            inputVisible = false;
            inputTexto.value = '';
        } else {
            inputBar.classList.add('active');
            inputVisible = true;
            setTimeout(() => inputTexto.focus(), 300);
        }
    }

    function enviarTexto() {
        const text = inputTexto.value.trim();
        if (!text || isProcessing || isTyping) return;
        inputTexto.value = '';
        inputBar.classList.remove('active');
        inputVisible = false;
        procesarMensaje(text);
    }

    // ============================================================
    // SERVIDOR
    // ============================================================
    async function enviarAlServidor(text) {
        try {
            const url = `${getServerUrl()}/api/chat`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mensaje: text })
            });
            if (response.status === 503) throw new Error('Servidor no disponible (503)');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (data.success) {
                hideTypingIndicator();
                addMessageWithTyping(data.reply, false, false, getCurrentTime());
                updateConnectionUI(true);
                reconnectAttempts = 0;
                notifyParent('BOT_REPLY', { reply: data.reply });
            } else {
                hideTypingIndicator();
                addMessageWithTyping(`❌ ${data.reply || 'Error desconocido'}`, false, true, getCurrentTime());
                notifyParent('ERROR', { error: data.reply || 'Error desconocido' });
            }
        } catch (error) {
            hideTypingIndicator();
            let errorMsg = error.message;
            if (error.message.includes('503')) errorMsg = 'El servidor de IA no está disponible.';
            else if (error.message.includes('Failed to fetch')) errorMsg = 'No se pudo conectar al servidor.';
            addMessageWithTyping(`❌ ${errorMsg}`, false, true, getCurrentTime());
            updateConnectionUI(false);
            notifyParent('ERROR', { error: error.message });
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                setTimeout(verificarServidor, 3000);
            }
        }
    }

    function procesarMensaje(text) {
        if (!text || isProcessing) return;
        if (text.trim() === '') return;
        addMessageToHistory(text, true, false, getCurrentTime());
        showTypingIndicator();
        isProcessing = true;
        enviarAlServidor(text).finally(() => { isProcessing = false; });
    }

    async function verificarServidor() {
        try {
            const url = `${getServerUrl()}/api/status`;
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(5000)
            });
            if (response.ok) {
                const data = await response.json();
                updateConnectionUI(data.ia_available || false);
                reconnectAttempts = 0;
                notifyParent('SERVER_STATUS', { online: serverOnline, port: serverPort });
                return true;
            }
        } catch (error) {
            reconnectAttempts++;
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) setTimeout(verificarServidor, 5000);
        }
        updateConnectionUI(false);
        notifyParent('SERVER_STATUS', { online: false, port: serverPort });
        return false;
    }

    // ============================================================
    // TOGGLE ASISTENTE
    // ============================================================
    function toggleAsistente() {
        assistantActive = !assistantActive;
        if (assistantActive) {
            logoG.classList.add('active');
            cloudDialog.classList.add('active');
            try { logoVideo.play(); } catch(e) {}
            verificarServidor();
            notifyParent('ASISTENTE_OPEN', { active: true });
        } else {
            logoG.classList.remove('active');
            cloudDialog.classList.remove('active');
            notifyParent('ASISTENTE_CLOSE', { active: false });
            stopSpeaking();
            if (inputVisible) { inputBar.classList.remove('active'); inputVisible = false; }
            if (micActive) {
                micActive = false;
                if (isListening) try { recognition.stop(); } catch(e) {}
                isListening = false;
                micBtn.classList.remove('mic-on');
            }
            try { logoVideo.pause(); } catch(e) {}
        }
    }

    // ============================================================
    // VIDEO LOOP
    // ============================================================
    function setupSeamlessVideoLoop() {
        if (!logoVideo) return;
        let isTransitioning = false;
        function seamlessRestart() {
            if (isTransitioning || !logoVideo) return;
            isTransitioning = true;
            try {
                logoVideo.pause();
                logoVideo.currentTime = 0;
                requestAnimationFrame(() => {
                    if (logoVideo) logoVideo.play().catch(() => {});
                    isTransitioning = false;
                });
            } catch (e) {
                logoVideo.play().catch(() => {});
                isTransitioning = false;
            }
        }
        logoVideo.addEventListener('timeupdate', function() {
            if (this.duration > 0) {
                const progress = this.currentTime / this.duration;
                if (progress >= 0.95 && !isTransitioning) seamlessRestart();
            }
        });
        logoVideo.addEventListener('ended', function() {
            if (!isTransitioning) {
                try { this.currentTime = 0; this.play().catch(() => {}); }
                catch (e) { this.load(); this.play().catch(() => {}); }
            }
        });
    }

    // ============================================================
    // MENSAJES DEL PADRE
    // ============================================================
    window.addEventListener('message', function(event) {
        const data = event.data;
        if (!data) return;
        const msgType = data.type || data.action;
        if (!msgType) return;

        switch (msgType) {
            case 'SET_PORT': if (data.port) serverPort = data.port; break;
            case 'TOGGLE_ASISTENTE':
            case 'openAssistant':
                if (!assistantActive) toggleAsistente();
                break;
            case 'closeAssistant':
            case 'CLOSE_ASISTENTE':
                if (assistantActive) toggleAsistente();
                break;
            case 'SEND_MESSAGE': if (data.text) procesarMensaje(data.text); break;
            case 'TOGGLE_AUDIO':
                if (data.active !== undefined) {
                    voiceActive = data.active;
                    if (!voiceActive && isSpeaking) stopSpeaking();
                    audioBtn.classList.toggle('active', voiceActive);
                    updateAudioIcon();
                }
                break;
            case 'CHECK_SERVER': verificarServidor(); break;
            case 'PING': notifyParent('PONG', { timestamp: Date.now(), port: serverPort }); break;
        }
    });

    function updateAudioIcon() {
        if (voiceActive) {
            audioBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                </svg>
                <span class="tooltip">Audio</span>
            `;
        } else {
            audioBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    <line x1="23" y1="9" x2="17" y2="15"/>
                    <line x1="17" y1="9" x2="23" y2="15"/>
                </svg>
                <span class="tooltip">Audio</span>
            `;
        }
    }

    // ============================================================
    // EVENTOS
    // ============================================================
    logoBody.addEventListener('click', function(e) {
        e.stopPropagation();
        if (!assistantActive) {
            toggleAsistente();
            setTimeout(toggleInput, 500);
        } else {
            toggleInput();
        }
    });

    btnSend.addEventListener('click', function(e) { e.stopPropagation(); enviarTexto(); });

    inputTexto.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarTexto(); }
        if (e.key === 'Escape') { inputBar.classList.remove('active'); inputVisible = false; inputTexto.value = ''; }
    });

    document.addEventListener('click', function(e) {
        if (inputVisible && !inputBar.contains(e.target) && !logoBody.contains(e.target)) {
            inputBar.classList.remove('active');
            inputVisible = false;
            inputTexto.value = '';
        }
    });

    micBtn.addEventListener('click', function(e) { e.stopPropagation(); toggleMic(); });

    clearBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        limpiarChat();
        clearBtn.style.transform = 'scale(0.8)';
        setTimeout(() => { clearBtn.style.transform = 'scale(1)'; }, 200);
    });

    audioBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        voiceActive = !voiceActive;
        audioBtn.classList.toggle('active', voiceActive);
        updateAudioIcon();
        if (!voiceActive && isSpeaking) stopSpeaking();
        notifyParent('TOGGLE_AUDIO', { active: voiceActive });
    });

    // ============================================================
    // INIT
    // ============================================================
    initVoiceRecognition();
    loadFemaleVoice();

    if (logoVideo.readyState >= 2) {
        setupSeamlessVideoLoop();
    } else {
        logoVideo.addEventListener('loadeddata', setupSeamlessVideoLoop);
    }

    setTimeout(() => {
        notifyParent('ASISTENTE_READY', { version: '10.0', port: serverPort, timestamp: Date.now() });
    }, 500);

    setInterval(() => { if (assistantActive) verificarServidor(); }, 30000);

    console.log('✅ Asistente ALFA listo con colores del panel');
})();