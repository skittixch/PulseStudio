
        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { getFirestore, doc, setDoc, getDoc, addDoc, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

        // --- Firebase Config & Init ---
        let db, auth, appId;
        const firebaseReady = typeof __firebase_config !== 'undefined';

        if (firebaseReady) {
            const firebaseConfig = JSON.parse(__firebase_config);
            const app = initializeApp(firebaseConfig);
            auth = getAuth(app);
            db = getFirestore(app);
            appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        } else {
            console.warn("Firebase config not found. Persistence and sharing will be disabled.");
            appId = 'local-dev';
            // Placeholder for db/auth to prevent crashes
            db = null;
            auth = { onAuthStateChanged: (cb) => cb(null) };
        }
        let currentUser = null;

        // --- Gemini API Key (Not used in this version) ---
        const apiKey = "";

        // --- Musical Constants ---
        const STEPS_PER_PATTERN = 16;

        // Frequencies for C4-C5 range (Middle C to Tenor C)
        const FREQS = {
            'E5': 659.25, 'D#5': 622.25, 'D5': 587.33, 'C#5': 554.37,
            'C5': 523.25, 'B4': 493.88, 'A#4': 466.16, 'A4': 440.00, 'G#4': 415.30, 'G4': 392.00,
            'F#4': 369.99, 'F4': 349.23, 'E4': 329.63, 'D#4': 311.13, 'D4': 293.66, 'C#4': 277.18, 'C4': 261.63,
            'A3': 220.00, 'G3': 196.00 // Extensions for minor pent
        };

        const SCALES = {
            // Full 8-note definitions (7 scale + octave or extended)
            'C Maj Pent': { labels: ['E5', 'D5', 'C5', 'A4', 'G4', 'E4', 'D4', 'C4'] }, // Extended
            'A Min Pent': { labels: ['C5', 'A4', 'G4', 'E4', 'D4', 'C4', 'A3', 'G3'] }, // Extended
            'C Major': { labels: ['C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4'] }, // Diatonic
            'A Minor': { labels: ['A4', 'G4', 'F4', 'E4', 'D4', 'C4', 'B3', 'A3'] }, // Diatonic
            'Blues': { labels: ['G4', 'F#4', 'F4', 'D#4', 'D4', 'C4', 'A#3', 'A3'] },
            'Phrygian': { labels: ['C5', 'A#4', 'G#4', 'G4', 'F4', 'D#4', 'C#4', 'C4'] } // C Phrygian
        };

        const CHROMATIC_LABELS = ['C5', 'B4', 'A#4', 'A4', 'G#4', 'G4', 'F#4', 'F4', 'E4', 'D#4', 'D4', 'C#4', 'C4'];

        const DRUM_KITS = {
            'Classic 808': {
                kick: { freq: 55, decay: 0.8 },
                snare: { freq: 1500, decay: 0.2, mix: 0.5 },
                hat: { freq: 4000, decay: 0.05 }
            },
            'Modern Trap': {
                kick: { freq: 45, decay: 1.2 },
                snare: { freq: 2000, decay: 0.15, mix: 0.7 },
                hat: { freq: 6000, decay: 0.03 }
            },
            'Industrial': {
                kick: { freq: 65, decay: 0.4 },
                snare: { freq: 800, decay: 0.5, mix: 0.4 },
                hat: { freq: 2500, decay: 0.1 }
            },
            'LoFi Vinyl': {
                kick: { freq: 50, decay: 0.2 },
                snare: { freq: 1200, decay: 0.3, mix: 0.3 },
                hat: { freq: 3000, decay: 0.08 }
            },
            'Techno 909': {
                kick: { freq: 48, decay: 0.6 },
                snare: { freq: 1800, decay: 0.25, mix: 0.6 },
                hat: { freq: 5000, decay: 0.06 }
            },
            'Deep House': {
                kick: { freq: 52, decay: 0.5 },
                snare: { freq: 1400, decay: 0.2, mix: 0.4 },
                hat: { freq: 4500, decay: 0.04 }
            },
            'Vintage Rock': {
                kick: { freq: 80, decay: 0.3 },
                snare: { freq: 800, decay: 0.4, mix: 0.3 },
                hat: { freq: 3500, decay: 0.12 }
            },
            'Glitch': {
                kick: { freq: 110, decay: 0.1 },
                snare: { freq: 3000, decay: 0.05, mix: 0.8 },
                hat: { freq: 10000, decay: 0.02 }
            },
            'Minimal': {
                kick: { freq: 40, decay: 0.2 },
                snare: { freq: 1000, decay: 0.1, mix: 0.2 },
                hat: { freq: 9000, decay: 0.01 }
            },
            'Cinematic': {
                kick: { freq: 30, decay: 1.5 },
                snare: { freq: 500, decay: 1.0, mix: 0.5 },
                hat: { freq: 1500, decay: 0.5 }
            }
        };

        const DEFAULT_SOUND_CONFIG = {
            kick: { freq: 55, decay: 0.7 },
            snare: { freq: 1500, decay: 0.2, mix: 0.5 },
            hat: { freq: 4000, decay: 0.05 },
            synth: { type: 'sine', release: 0.4, filter: 2000 }
        };

        let soundConfig = JSON.parse(JSON.stringify(DEFAULT_SOUND_CONFIG));
        let lastDrumKitName = 'Classic 808';

        function randomizeDrums() {
            const kitNames = Object.keys(DRUM_KITS);
            const availableKits = kitNames.filter(name => name !== lastDrumKitName);

            // Graceful probability: weigh by how different they are? 
            // Simplified: just pick from available to avoid repeat.
            const newKitName = availableKits[Math.floor(Math.random() * availableKits.length)];
            const kit = DRUM_KITS[newKitName];

            soundConfig.kick = { ...kit.kick };
            soundConfig.snare = { ...kit.snare };
            soundConfig.hat = { ...kit.hat };

            // Also randomize synth a bit
            const synthTypes = ['sine', 'triangle', 'square'];
            soundConfig.synth.type = synthTypes[Math.floor(Math.random() * synthTypes.length)];
            soundConfig.synth.filter = 500 + Math.random() * 3000;

            lastDrumKitName = newKitName;
            showToast(`Drum Kit: ${newKitName}`);
            triggerDebouncedSave();
        }

        const DEFAULT_DRUM_ROWS = [
            { label: 'Hi-Hat', color: 'bg-amber-500/5', activeColor: 'bg-amber-500', type: 'hat' },
            { label: 'Snare', color: 'bg-orange-500/5', activeColor: 'bg-orange-500', type: 'snare' },
            { label: 'Kick', color: 'bg-rose-500/5', activeColor: 'bg-rose-500', type: 'kick' }
        ];

        const DEFAULT_SOUND_CONFIG = {
            synth: { type: 'sawtooth', attack: 0.01, release: 0.1, filter: 3000 },
            kick: { freq: 150, decay: 0.4 },
            snare: { freq: 1200, decay: 0.15, mix: 0.5 },
            hat: { freq: 8000, decay: 0.04 }
        };

        // --- State Management ---
        let audioCtx = null;
        let isPlaying = false;
        let isFollowMode = true;
        let isUnrolled = false;
        let currentScale = 'C Maj Pent';
        // Per-Pattern State (Initialized with 1st pattern)
        let patternScales = ['C Maj Pent'];
        let drumRows = JSON.parse(JSON.stringify(DEFAULT_DRUM_ROWS)); // Mutable drum config


        let bpm = 120;
        let timerID = null;
        let nextNoteTime = 0;
        let saveTimeout = null;
        let resetTimeout = null;
        let patternClipboard = null;
        let desiredNoteDuration = 1;

        // History State
        let historyStack = [];
        let redoStack = [];

        // Drag/Select State
        let selectedNotes = new Set(); // "r,c" strings
        let isSelecting = false;
        let selectionStart = null; // {x, y} relative to grid container
        let isDragging = false;
        let isCopyDrag = false;
        let dragStart = null; // {x, y}
        let dragStartSelection = []; // Array of {r, c} objects
        let dragDirection = null; // 'h' or 'v'
        // CACHED GEOMETRY
        let cachedGridRect = null;
        let cachedCellWidth = 0;
        let cachedCellHeight = 0;

        let song = [
            generateBlankGrid(false)
        ];

        let editingPatternIndex = 0;
        let playbackPatternIndex = 0;
        let playbackStepIndex = 0;
        let queuedPatternIndex = -1;
        let loopLockedPatternIndex = -1;

        // Resize state
        let isResizingNote = false;
        let resizeStart = null;
        let resizeStartDuration = 1;
        let resizeNotePos = { r: 0, c: 0 };

        let selectedParts = new Set(); // Set of indices
        let isTimelineSelecting = false;
        let timelineSelectionStart = null;
        let isTimelineDragging = false;
        let isTimelineWaitingToDrag = false;
        let isTimelineCopyDrag = false;
        let timelineDragStart = null;
        let timelineDragStartIndex = -1;
        let isTimelineBusy = false; // Prevents click after drag/marquee

        function generateBlankGrid(unrolled) {
            const synthRows = unrolled ? 16 : 8;
            const sCount = unrolled ? 13 : 8;
            const rows = sCount + drumRows.length;
            return Array(rows).fill().map(() => Array(STEPS_PER_PATTERN).fill(null));
        }

        function isPatternEmpty(grid) {
            for (let r = 0; r < grid.length; r++) {
                for (let c = 0; c < grid[r].length; c++) {
                    if (grid[r][c] !== null) return false;
                }
            }
            return true;
        }

        // --- Undo/Redo Logic ---
        function pushToHistory() {
            const state = {
                song: JSON.parse(JSON.stringify(song)),
                bpm: bpm,
                isUnrolled: isUnrolled,
                currentScale: currentScale,
                patternScales: JSON.parse(JSON.stringify(patternScales)),
                editingPatternIndex: editingPatternIndex,
                selectedNotes: Array.from(selectedNotes),
                drumRows: JSON.parse(JSON.stringify(drumRows)),
                soundConfig: JSON.parse(JSON.stringify(soundConfig))
            };
            historyStack.push(state);
            if (historyStack.length > 50) historyStack.shift();
            redoStack = [];
            updateUndoRedoUI();
        }

        function undo() {
            if (historyStack.length === 0) return;
            const currentState = {
                song: JSON.parse(JSON.stringify(song)),
                bpm: bpm,
                isUnrolled: isUnrolled,
                currentScale: currentScale,
                patternScales: JSON.parse(JSON.stringify(patternScales)),
                editingPatternIndex: editingPatternIndex,
                selectedNotes: Array.from(selectedNotes),
                drumRows: JSON.parse(JSON.stringify(drumRows)),
                soundConfig: JSON.parse(JSON.stringify(soundConfig))
            };
            redoStack.push(currentState);
            const prevState = historyStack.pop();
            applyState(prevState);
            updateUndoRedoUI();
            showToast("Undo");
        }

        function redo() {
            if (redoStack.length === 0) return;
            const currentState = {
                song: JSON.parse(JSON.stringify(song)),
                bpm: bpm,
                isUnrolled: isUnrolled,
                currentScale: currentScale,
                patternScales: JSON.parse(JSON.stringify(patternScales)),
                editingPatternIndex: editingPatternIndex,
                selectedNotes: Array.from(selectedNotes),
                drumRows: JSON.parse(JSON.stringify(drumRows)),
                soundConfig: JSON.parse(JSON.stringify(soundConfig))
            };
            historyStack.push(currentState);
            const nextState = redoStack.pop();
            applyState(nextState);
            updateUndoRedoUI();
            showToast("Redo");
        }

        function applyState(state) {
            song = state.song;
            bpm = state.bpm;
            isUnrolled = state.isUnrolled;
            currentScale = state.currentScale;
            patternScales = state.patternScales;
            editingPatternIndex = state.editingPatternIndex;
            if (state.drumRows) drumRows = state.drumRows;
            if (state.soundConfig) soundConfig = state.soundConfig;

            // Restore selection
            selectedNotes = new Set(state.selectedNotes || []);

            const bpmInput = document.getElementById('bpmInput');
            if (bpmInput) bpmInput.value = bpm;

            const scaleSelect = document.getElementById('scaleSelect');
            if (scaleSelect) scaleSelect.value = currentScale;

            const unrollBtn = document.getElementById('unrollBtn');
            if (isUnrolled) {
                unrollBtn.classList.add('unroll-active');
                scaleSelect.disabled = true;
                scaleSelect.classList.add('opacity-50');
            } else {
                unrollBtn.classList.remove('unroll-active');
                scaleSelect.disabled = false;
                scaleSelect.classList.remove('opacity-50');
            }

            renderEditor();
            updateTimelineVisuals();
            triggerDebouncedSave();
        }

        function updateUndoRedoUI() {
            const undoBtn = document.getElementById('undoBtn');
            const redoBtn = document.getElementById('redoBtn');
            if (undoBtn) undoBtn.disabled = historyStack.length === 0;
            if (redoBtn) redoBtn.disabled = redoStack.length === 0;
        }

        // --- Dynamic Config Getters ---
        function getRowConfigs(targetScale) {
            const scaleName = targetScale || currentScale;
            const scaleData = SCALES[scaleName] || SCALES['C Maj Pent'];
            const synthLabels = isUnrolled ? CHROMATIC_LABELS : scaleData.labels;

            const synthRows = synthLabels.map(label => ({
                label: label,
                color: 'bg-sky-500/5',
                activeColor: 'bg-sky-500',
                freq: FREQS[label] || 261.63
            }));

            return [...synthRows, ...drumRows];
        }

        // --- Sound Randomization Logic ---


        // --- Drum Management ---
        function addDrumRow() {
            pushToHistory();
            // Generate a random frequency for a low perc/tom sound
            const freq = Math.floor(50 + Math.random() * 100);
            drumRows.push({
                label: 'Perc',
                color: 'bg-purple-500/5',
                activeColor: 'bg-purple-500',
                type: 'custom',
                freq: freq
            });

            // Add row to ALL existing grids
            song.forEach(grid => {
                grid.push(Array(STEPS_PER_PATTERN).fill(false));
            });

            renderEditor();
            updateTimelineVisuals();
            triggerDebouncedSave();
            showToast("Percussion added");
        }

        // --- Conversion Logic ---
        function toggleUnroll() {
            pushToHistory();
            const oldUnrolled = isUnrolled;
            isUnrolled = !isUnrolled;
            const newUnrolled = isUnrolled;

            const newSong = song.map((grid, idx) => {
                const scale = patternScales[idx];
                const oldConfigs = oldUnrolled ? CHROMATIC_LABELS : SCALES[scale].labels;
                const newConfigs = newUnrolled ? CHROMATIC_LABELS : SCALES[scale].labels;

                const newGrid = generateBlankGrid(newUnrolled);

                // Calculate boundaries
                const drumCount = drumRows.length;
                const oldSynthRowCount = grid.length - drumCount;
                // Wait, generateBlankGrid uses current drumRows length. Correct.
                const newSynthRowCount = (newUnrolled ? 13 : 8);

                // Copy Drums
                for (let i = 0; i < drumCount; i++) {
                    if (grid[oldSynthRowCount + i]) {
                        newGrid[newSynthRowCount + i] = [...grid[oldSynthRowCount + i]];
                    }
                }

                // Map Synths
                for (let r = 0; r < oldSynthRowCount; r++) {
                    const noteName = oldConfigs[r];
                    let targetRow = newConfigs.indexOf(noteName);

                    if (targetRow === -1 && oldUnrolled && !newUnrolled) {
                        const targetFreq = FREQS[noteName];
                        let minDiff = Infinity;
                        newConfigs.forEach((name, i) => {
                            const diff = Math.abs(FREQS[name] - targetFreq);
                            if (diff < minDiff) { minDiff = diff; targetRow = i; }
                        });
                    }

                    if (targetRow !== -1) {
                        for (let s = 0; s < 16; s++) { if (grid[r][s]) newGrid[targetRow][s] = true; }
                    }
                }
                return newGrid;
            });

            song = newSong;
            selectedNotes.clear();

            const btn = document.getElementById('unrollBtn');
            const select = document.getElementById('scaleSelect');
            if (isUnrolled) {
                btn.classList.add('unroll-active');
                select.disabled = true;
                select.classList.add('opacity-50');
            } else {
                btn.classList.remove('unroll-active');
                select.disabled = false;
                select.classList.remove('opacity-50');
            }

            renderEditor();
            updateTimelineVisuals();
            triggerDebouncedSave();
        }

        function changeScale(newScale) {
            if (isUnrolled) return;
            pushToHistory();
            patternScales[editingPatternIndex] = newScale;

            const grid = song[editingPatternIndex];
            const newGrid = generateBlankGrid(false);

            // Copy Drums
            const drumCount = drumRows.length;
            const srcDrumStart = grid.length - drumCount;
            const dstDrumStart = newGrid.length - drumCount;

            for (let i = 0; i < drumCount; i++) {
                if (grid[srcDrumStart + i]) newGrid[dstDrumStart + i] = [...grid[srcDrumStart + i]];
            }

            // Map Synths (Copy row 1:1 up to new limit)
            const srcSynthCount = srcDrumStart;
            const dstSynthCount = dstDrumStart;

            for (let r = 0; r < Math.min(srcSynthCount, dstSynthCount); r++) {
                newGrid[r] = [...grid[r]];
            }

            song[editingPatternIndex] = newGrid;
            renderEditor();
            updateTimelineVisuals();
            triggerDebouncedSave();
        }

        // --- PRESETS ---
        const PRESETS = {
            "simple": { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
            "techno": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14], bass: [0, 2, 4, 6, 8, 10, 12, 14] },
            "house": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14], chord: [0, 3, 6, 9] },
            "hip hop": { kick: [0, 6, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
            "trap": { kick: [0, 8], snare: [8], hat: [0, 1, 2, 4, 5, 6, 8, 9, 10] },
            "rock": { kick: [0, 8, 14], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] }
        };

        // --- AI Logic ---
        async function generatePatternAI(manualStyle = null) {
            pushToHistory();
            const promptInput = document.getElementById('aiPromptInput');
            let prompt = "";

            if (manualStyle) {
                if (manualStyle === 'random') {
                    const keys = Object.keys(PRESETS).filter(k => k !== 'empty');
                    keys.push('procedural', 'procedural');
                    const picked = keys[Math.floor(Math.random() * keys.length)];
                    prompt = picked === 'procedural' ? 'random vibe' : picked;
                    showToast("Generated: " + (picked === 'procedural' ? 'Procedural' : picked.charAt(0).toUpperCase() + picked.slice(1)));
                } else {
                    prompt = manualStyle;
                }
            } else {
                prompt = promptInput.value.trim().toLowerCase();
                const lastPrompt = localStorage.getItem('pulse_last_ai_prompt');
                if (!prompt && lastPrompt) { prompt = lastPrompt; promptInput.value = lastPrompt; }
                if (!prompt) return;
                localStorage.setItem('pulse_last_ai_prompt', prompt);
            }

            const newGrid = generateBlankGrid(isUnrolled);
            // Dynamic synth row count
            const synthRows = newGrid.length - drumRows.length;

            let style = "random";
            if (prompt.includes("techno")) style = "techno";
            else if (prompt.includes("house")) style = "house";
            else if (prompt.includes("hip") || prompt.includes("hop")) style = "hip hop";
            else if (prompt.includes("trap")) style = "trap";
            else if (prompt.includes("rock")) style = "rock";
            else if (prompt.includes("clear") || prompt.includes("empty")) style = "empty";
            else if (prompt.includes("simple")) style = "simple";

            if (PRESETS[style]) {
                const p = PRESETS[style];
                // Offset drum rows dynamically
                // Drums are at synthRows + 0 (hat), +1 (snare), +2 (kick) for default layout
                // But we must map to 'type' not index for safety if user added drums.
                // For now, map to standard indices relative to start of drums
                const hatRow = synthRows;
                const snareRow = synthRows + 1;
                const kickRow = synthRows + 2;

                if (p.kick && kickRow < newGrid.length) p.kick.forEach(s => newGrid[kickRow][s] = true);
                if (p.snare && snareRow < newGrid.length) p.snare.forEach(s => newGrid[snareRow][s] = true);
                if (p.hat && hatRow < newGrid.length) p.hat.forEach(s => newGrid[hatRow][s] = true);

                if (p.bass) p.bass.forEach(s => newGrid[synthRows - 1][s] = true);
                if (p.chord) p.chord.forEach(s => newGrid[Math.floor(synthRows / 2)][s] = true);

            } else {
                // Procedural
                const isSimple = prompt.includes("simple");
                const hatRow = synthRows;
                const snareRow = synthRows + 1;
                const kickRow = synthRows + 2;

                if (kickRow < newGrid.length) {
                    newGrid[kickRow][0] = true;
                    if (isSimple) { newGrid[kickRow][8] = true; }
                    else { if (Math.random() > 0.5) newGrid[kickRow][8] = true; if (Math.random() > 0.7) newGrid[kickRow][10] = true; }
                }

                if (snareRow < newGrid.length) {
                    newGrid[snareRow][4] = true; newGrid[snareRow][12] = true;
                }

                if (hatRow < newGrid.length) {
                    for (let i = 0; i < 16; i += 2) {
                        if (isSimple) { newGrid[hatRow][i] = true; }
                        else { if (Math.random() > 0.3) newGrid[hatRow][i] = true; if (Math.random() > 0.8) newGrid[hatRow][i + 1] = true; }
                    }
                }
            }

            song[editingPatternIndex] = newGrid;
            renderEditor();
            updateTimelineVisuals();
            triggerDebouncedSave();

            if (!document.getElementById('aiModal').classList.contains('hidden')) {
                closeAiModal();
                promptInput.value = '';
            }
        }

        // --- Persistence & Sharing ---
        function showToast(message) {
            const toast = document.getElementById('toast');
            toast.innerText = message;
            toast.classList.add('show');
            setTimeout(() => { toast.classList.remove('show'); }, 3000);
        }

        async function handleShare() {
            setSyncStatus('saving');
            const modal = document.getElementById('shareModal');
            const content = document.getElementById('shareModalContent');
            const input = document.getElementById('shareUrlInput');
            const copyBtn = document.getElementById('copyShareLinkBtn');

            input.value = "Generating ID...";
            copyBtn.innerText = "Copy ID";
            copyBtn.disabled = true;
            copyBtn.classList.add('opacity-50');
            modal.classList.remove('hidden');
            setTimeout(() => { modal.classList.remove('opacity-0'); content.classList.remove('scale-95'); content.classList.add('scale-100'); }, 10);

            try {
                const sharedCol = collection(db, 'artifacts', appId, 'public', 'data', 'shared_songs');
                const docRef = await addDoc(sharedCol, {
                    song: JSON.stringify(song),
                    patternScales: JSON.stringify(patternScales),
                    bpm: bpm,
                    isUnrolled: isUnrolled,
                    currentScale: currentScale,
                    drumRows: JSON.stringify(drumRows),
                    soundConfig: JSON.stringify(soundConfig), // Save sounds
                    createdAt: Date.now()
                });
                const shareId = docRef.id;
                input.value = shareId;
                copyBtn.disabled = false;
                copyBtn.classList.remove('opacity-50');

                copyBtn.onclick = () => {
                    input.select();
                    input.setSelectionRange(0, 99999);
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(shareId).then(() => { copyBtn.innerText = "Copied!"; }).catch(() => { document.execCommand('copy'); copyBtn.innerText = "Copied!"; });
                    } else {
                        document.execCommand('copy'); copyBtn.innerText = "Copied!";
                    }
                    setTimeout(() => copyBtn.innerText = "Copy ID", 2000);
                };
                setSyncStatus('saved');
            } catch (err) { console.error(err); input.value = "Error"; setSyncStatus('error'); }
        }

        const loadModal = document.getElementById('loadModal');
        const loadContent = document.getElementById('loadModalContent');

        function openLoadModal() {
            loadModal.classList.remove('hidden');
            setTimeout(() => { loadModal.classList.remove('opacity-0'); loadContent.classList.remove('scale-95'); loadContent.classList.add('scale-100'); }, 10);
            document.getElementById('loadIdInput').value = ''; document.getElementById('loadIdInput').focus();
        }
        function closeLoadModal() {
            loadModal.classList.add('opacity-0'); loadContent.classList.remove('scale-100'); loadContent.classList.add('scale-95'); setTimeout(() => loadModal.classList.add('hidden'), 300);
        }
        function handleConfirmLoad() {
            const id = document.getElementById('loadIdInput').value.trim();
            if (id) { loadSharedSong(id); closeLoadModal(); }
        }

        function closeShareModal() {
            const modal = document.getElementById('shareModal');
            const content = document.getElementById('shareModalContent');
            modal.classList.add('opacity-0'); content.classList.remove('scale-100'); content.classList.add('scale-95'); setTimeout(() => modal.classList.add('hidden'), 300);
        }

        async function loadSharedSong(id) {
            pushToHistory();
            setSyncStatus('loading');
            try {
                const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'shared_songs', id);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const data = snap.data();
                    let loadedSong = JSON.parse(data.song);
                    if (data.bpm) { bpm = data.bpm; document.getElementById('bpmInput').value = bpm; }
                    if (data.isUnrolled !== undefined) isUnrolled = data.isUnrolled;
                    if (data.patternScales) patternScales = JSON.parse(data.patternScales);
                    else if (data.currentScale) patternScales = new Array(loadedSong.length).fill(data.currentScale);
                    else patternScales = new Array(loadedSong.length).fill('C Maj Pent');

                    if (data.drumRows) drumRows = JSON.parse(data.drumRows);
                    else drumRows = JSON.parse(JSON.stringify(DEFAULT_DRUM_ROWS));

                    if (data.soundConfig) soundConfig = JSON.parse(data.soundConfig);
                    else soundConfig = JSON.parse(JSON.stringify(DEFAULT_SOUND_CONFIG));

                    // Migration Logic for Song Grid Rows
                    song = loadedSong.map(grid => {
                        const expectedRows = (isUnrolled ? 13 : 8) + drumRows.length;
                        if (grid.length !== expectedRows) {
                            const newGrid = Array(expectedRows).fill().map(() => Array(STEPS_PER_PATTERN).fill(false));
                            for (let r = 0; r < Math.min(grid.length, expectedRows); r++) {
                                newGrid[r] = [...grid[r]];
                            }
                            return newGrid;
                        }
                        return grid;
                    });

                    const unrollBtn = document.getElementById('unrollBtn');
                    const select = document.getElementById('scaleSelect');
                    if (isUnrolled) {
                        unrollBtn.classList.add('unroll-active'); select.disabled = true; select.classList.add('opacity-50');
                    } else {
                        unrollBtn.classList.remove('unroll-active'); select.disabled = false; select.classList.remove('opacity-50');
                    }

                    if (editingPatternIndex >= song.length) editingPatternIndex = 0;
                    renderEditor();
                    updateTimelineVisuals();
                    showToast("Shared song loaded!");
                }
                setSyncStatus('ready');
            } catch (err) { console.error(err); setSyncStatus('error'); showToast("Failed to load song."); }
        }

        async function saveToCloud() {
            if (!currentUser) return;
            setSyncStatus('saving');
            try {
                const userSongDoc = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'songData', 'main');
                await setDoc(userSongDoc, {
                    song: JSON.stringify(song),
                    patternScales: JSON.stringify(patternScales),
                    bpm: bpm,
                    isUnrolled: isUnrolled,
                    currentScale: currentScale,
                    drumRows: JSON.stringify(drumRows),
                    soundConfig: JSON.stringify(soundConfig),
                    lastUpdated: Date.now()
                }, { merge: true });
                setSyncStatus('saved');
            } catch (err) { setSyncStatus('error'); }
        }

        function triggerDebouncedSave() { clearTimeout(saveTimeout); saveTimeout = setTimeout(saveToCloud, 2000); }

        async function loadFromCloud(user) {
            setSyncStatus('loading');
            try {
                const userSongDoc = doc(db, 'artifacts', appId, 'users', user.uid, 'songData', 'main');
                const snap = await getDoc(userSongDoc);
                if (snap.exists()) {
                    const data = snap.data();
                    let loadedSong = JSON.parse(data.song);
                    if (data.bpm) { bpm = data.bpm; document.getElementById('bpmInput').value = bpm; }
                    if (data.isUnrolled !== undefined) isUnrolled = data.isUnrolled;
                    if (data.patternScales) patternScales = JSON.parse(data.patternScales);
                    else if (data.currentScale) patternScales = new Array(loadedSong.length).fill(data.currentScale);
                    else patternScales = new Array(loadedSong.length).fill('C Maj Pent');

                    if (data.drumRows) drumRows = JSON.parse(data.drumRows);
                    else drumRows = JSON.parse(JSON.stringify(DEFAULT_DRUM_ROWS));

                    if (data.soundConfig) soundConfig = JSON.parse(data.soundConfig);
                    else soundConfig = JSON.parse(JSON.stringify(DEFAULT_SOUND_CONFIG));

                    // Migration Logic
                    song = loadedSong.map(grid => {
                        const expectedRows = (isUnrolled ? 13 : 8) + drumRows.length;
                        if (grid.length !== expectedRows) {
                            const newGrid = Array(expectedRows).fill().map(() => Array(STEPS_PER_PATTERN).fill(false));
                            for (let r = 0; r < Math.min(grid.length, expectedRows); r++) {
                                newGrid[r] = [...grid[r]];
                            }
                            return newGrid;
                        }
                        return grid;
                    });

                    const unrollBtn = document.getElementById('unrollBtn');
                    const select = document.getElementById('scaleSelect');
                    if (isUnrolled) {
                        unrollBtn.classList.add('unroll-active'); select.disabled = true; select.classList.add('opacity-50');
                    } else {
                        unrollBtn.classList.remove('unroll-active'); select.disabled = false; select.classList.remove('opacity-50');
                    }

                    if (editingPatternIndex >= song.length) editingPatternIndex = 0;
                    renderEditor();
                    updateTimelineVisuals();
                }
                setSyncStatus('ready');
            } catch (err) { setSyncStatus('error'); }
        }

        function setSyncStatus(status) {
            const dot = document.getElementById('syncDot');
            const text = document.getElementById('syncText');
            if (!dot || !text) return;
            dot.classList.remove('bg-emerald-500', 'bg-sky-500', 'bg-rose-500', 'bg-slate-700', 'sync-active');
            switch (status) {
                case 'saving': dot.classList.add('bg-sky-500', 'sync-active'); text.innerText = 'Syncing'; break;
                case 'saved': dot.classList.add('bg-emerald-500'); text.innerText = 'Synced'; setTimeout(() => setSyncStatus('ready'), 3000); break;
                case 'loading': dot.classList.add('bg-sky-500', 'sync-active'); text.innerText = 'Restoring'; break;
                case 'ready': dot.classList.add('bg-slate-700'); text.innerText = 'Standby'; break;
                case 'error': dot.classList.add('bg-rose-500'); text.innerText = 'Error'; break;
            }
        }

        // --- Audio ---
        function createKick(time) {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.frequency.setValueAtTime(soundConfig.kick.freq, time);
            osc.frequency.exponentialRampToValueAtTime(0.01, time + soundConfig.kick.decay);
            gain.gain.setValueAtTime(0.8, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + soundConfig.kick.decay);
            osc.start(time); osc.stop(time + soundConfig.kick.decay);
        }
        function createSnare(time) {
            const noise = audioCtx.createBufferSource();
            const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.1, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
            noise.buffer = buffer;
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'highpass'; filter.frequency.value = soundConfig.snare.freq;
            const gain = audioCtx.createGain();
            gain.gain.setValueAtTime(soundConfig.snare.mix, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + soundConfig.snare.decay);
            noise.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
            noise.start(time);

            const osc = audioCtx.createOscillator();
            const oscGain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(200, time);
            oscGain.gain.setValueAtTime(1 - soundConfig.snare.mix, time);
            oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
            osc.connect(oscGain); oscGain.connect(audioCtx.destination);
            osc.start(time); osc.stop(time + 0.15);
        }
        function createHiHat(time) {
            const bufferSize = audioCtx.sampleRate * 0.05;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'bandpass'; filter.frequency.value = soundConfig.hat.freq;
            const gain = audioCtx.createGain();
            gain.gain.setValueAtTime(0.3, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + soundConfig.hat.decay);
            noise.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
            noise.start(time);
        }
        function createTom(time, freq = 100) {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.frequency.setValueAtTime(freq, time);
            osc.frequency.exponentialRampToValueAtTime(10, time + 0.5);
            gain.gain.setValueAtTime(0.5, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.4);
            osc.start(time); osc.stop(time + 0.5);
        }
        function createSynth(freq, time, durationSteps = 1) {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            const filter = audioCtx.createBiquadFilter();

            const secondsPerStep = 60.0 / bpm / 4;
            const durationSecs = durationSteps * secondsPerStep;
            const release = Math.max(0.05, Math.min(durationSecs, soundConfig.synth.release));

            osc.type = soundConfig.synth.type;
            osc.frequency.setValueAtTime(freq, time);
            filter.type = 'lowpass'; filter.frequency.setValueAtTime(soundConfig.synth.filter, time);
            osc.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(0.08, time + 0.01);
            // Settle into duration
            gain.gain.setValueAtTime(0.08, time + durationSecs - 0.01);
            gain.gain.exponentialRampToValueAtTime(0.01, time + durationSecs + release);
            osc.start(time); osc.stop(time + durationSecs + release + 0.1);
        }

        // --- Logic ---
        function scheduler() {
            while (nextNoteTime < audioCtx.currentTime + 0.1) {
                playStepAtTime(playbackPatternIndex, playbackStepIndex, nextNoteTime);
                advancePlayback();
            }
            timerID = setTimeout(scheduler, 25);
        }
        function advancePlayback() {
            const secondsPerBeat = 60.0 / bpm / 4;
            nextNoteTime += secondsPerBeat;
            playbackStepIndex++;
            if (playbackStepIndex >= STEPS_PER_PATTERN) {
                playbackStepIndex = 0;

                let effectiveLength = song.length;
                let lastNonEmpty = song.length - 1;
                while (lastNonEmpty > 0 && isPatternEmpty(song[lastNonEmpty])) {
                    lastNonEmpty--;
                }
                effectiveLength = lastNonEmpty + 1;

                if (queuedPatternIndex !== -1) {
                    playbackPatternIndex = queuedPatternIndex;
                    queuedPatternIndex = -1; loopLockedPatternIndex = -1;
                    requestAnimationFrame(updateTimelineVisuals);
                } else if (loopLockedPatternIndex !== -1) {
                    playbackPatternIndex = loopLockedPatternIndex;
                } else {
                    playbackPatternIndex++;
                    if (playbackPatternIndex >= effectiveLength) {
                        playbackPatternIndex = 0;
                    }
                }
                if (isFollowMode) {
                    editingPatternIndex = playbackPatternIndex;
                    requestAnimationFrame(() => {
                        renderEditor();
                        const container = document.getElementById('timelineWrapper');
                        const clip = document.getElementById(`clip-${playbackPatternIndex}`);
                        if (container && clip) {
                            const offset = clip.offsetLeft - container.offsetLeft;
                            container.scrollTo({ left: offset, behavior: 'smooth' });
                        }
                    });
                }
            }
            requestAnimationFrame(updatePlaybackUI);
        }

        function playStepAtTime(pIndex, sIndex, time) {
            if (!song[pIndex]) return;
            const currentGrid = song[pIndex];
            const scaleName = patternScales[pIndex];
            const configs = getRowConfigs(scaleName);
            const synthRows = configs.length - drumRows.length;
            const secondsPerStep = 60.0 / bpm / 4;

            for (let i = 0; i < synthRows; i++) {
                const note = currentGrid[i][sIndex];
                if (note) {
                    const noteTime = time + (note.o || 0) * secondsPerStep;
                    createSynth(configs[i].freq, noteTime, note.d || 1);
                }
            }

            const drumStart = synthRows;
            drumRows.forEach((drum, idx) => {
                const note = currentGrid[drumStart + idx][sIndex];
                if (note) {
                    const noteTime = time + (note.o || 0) * secondsPerStep;
                    if (drum.type === 'hat') createHiHat(noteTime);
                    else if (drum.type === 'snare') createSnare(noteTime);
                    else if (drum.type === 'kick') createKick(noteTime);
                    else if (drum.type === 'custom') createTom(noteTime, drum.freq);
                }
            });
        }

        function updatePlaybackUI() {
            const totalSeconds = (playbackPatternIndex * STEPS_PER_PATTERN + playbackStepIndex) * (60.0 / bpm / 4);
            const m = Math.floor(totalSeconds / 60);
            const s = Math.floor(totalSeconds % 60);
            const songTime = document.getElementById('songTime');
            if (songTime) songTime.innerText = `${m}:${s.toString().padStart(2, '0')}`;

            const scrubber = document.getElementById('scrubber');
            const currentClip = document.getElementById(`clip-${playbackPatternIndex}`);
            if (currentClip && isPlaying) {
                if (scrubber) scrubber.classList.remove('hidden');
                const clipWidth = currentClip.offsetWidth;
                const progressInClip = playbackStepIndex / STEPS_PER_PATTERN;
                const leftPos = currentClip.offsetLeft + (progressInClip * clipWidth);
                if (scrubber) scrubber.style.transform = `translateX(${leftPos}px)`;
            } else if (!isPlaying) {
                if (scrubber) scrubber.classList.add('hidden');
            }

            if (playbackPatternIndex === editingPatternIndex) {
                document.querySelectorAll('.step').forEach(s => s.classList.remove('playing'));
                document.querySelectorAll(`.step-at-${playbackStepIndex}`).forEach(s => s.classList.add('playing'));
            } else {
                document.querySelectorAll('.step').forEach(s => s.classList.remove('playing'));
            }
        }

        // --- UI ---
        function renderEditor() {
            const container = document.getElementById('gridContainer');
            if (!container) return;

            Array.from(container.children).forEach(child => {
                if (child.id !== 'selectionMarquee') child.remove();
            });

            container.style.gridTemplateColumns = `80px repeat(${STEPS_PER_PATTERN}, 1fr)`;

            const currentGrid = song[editingPatternIndex];
            const activeScale = patternScales[editingPatternIndex];
            if (activeScale) {
                currentScale = activeScale;
                const scaleSelect = document.getElementById('scaleSelect');
                if (scaleSelect && scaleSelect.value !== activeScale) {
                    scaleSelect.value = activeScale;
                }
            }

            const configs = getRowConfigs(activeScale);
            document.getElementById('patternDisplay').innerText = (editingPatternIndex + 1).toString().padStart(2, '0');

            configs.forEach((config, rowIndex) => {
                const label = document.createElement('div');
                label.className = 'flex items-center text-[10px] font-bold uppercase text-slate-500 pr-2 select-none pointer-events-none justify-end';

                if (rowIndex === configs.length - 1) {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'flex flex-col items-end gap-0.5 w-full';

                    const text = document.createElement('span');
                    text.innerText = config.label;

                    const addBtn = document.createElement('div');
                    addBtn.className = 'w-full h-3 mt-1 bg-slate-800/50 rounded flex items-center justify-center cursor-pointer hover:bg-slate-700 text-[8px] text-slate-500 hover:text-sky-400 pointer-events-auto';
                    addBtn.innerHTML = '+ Add Perc';
                    addBtn.title = "Add Drum Row";
                    addBtn.onclick = (e) => {
                        e.stopPropagation();
                        addDrumRow();
                    };

                    wrapper.appendChild(text);
                    wrapper.appendChild(addBtn);
                    label.appendChild(wrapper);
                    label.className = label.className.replace('items-center', 'items-start pt-1');
                } else {
                    label.innerText = config.label;
                }

                container.appendChild(label);

                for (let s = 0; s < STEPS_PER_PATTERN; s++) {
                    const note = currentGrid[rowIndex][s];
                    const isSelected = selectedNotes.has(`${rowIndex},${s}`);

                    let className = `step step-at-${s} h-8 rounded cursor-pointer border border-white/5 hover:brightness-150 transition-all relative `;
                    if (isUnrolled) className = className.replace('h-8', 'h-6');

                    if (note) className += config.activeColor + ' ';
                    else className += config.color + ' ';

                    if (isSelected) className += 'selected ';

                    const step = document.createElement('div');
                    step.className = className;
                    step.dataset.r = rowIndex;
                    step.dataset.c = s;

                    if (note) {
                        // Apply Duration (d)
                        if (note.d && note.d > 1) {
                            const span = Math.min(note.d, STEPS_PER_PATTERN - s);
                            const cellsRemainingInSpan = Math.ceil(span);
                            step.style.gridColumn = `span ${cellsRemainingInSpan}`;
                            step.style.width = `${(span / cellsRemainingInSpan) * 100}%`;
                            step.style.zIndex = '10';
                        }

                        // Apply offset (o)
                        if (note.o) {
                            const offsetPx = note.o * (cachedCellWidth || 40);
                            step.style.left = `${offsetPx}px`;
                        }

                        // Resize Handle
                        const handle = document.createElement('div');
                        handle.className = 'note-resize-handle absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 hover:bg-white/30 transition-opacity z-20';
                        handle.onmousedown = (e) => {
                            e.stopPropagation();
                            startNoteResizing(e, rowIndex, s);
                        };
                        step.appendChild(handle);

                        // Skip spanning cells in loop
                        if (note.d > 1) {
                            const skipCount = Math.floor(note.d + (note.o || 0)) - 1;
                            if (skipCount > 0) s += skipCount;
                        }
                    }

                    container.appendChild(step);
                }
            });
        }

        function insertPattern(idx) {
            pushToHistory();
            const newGrid = generateBlankGrid(isUnrolled);
            song.splice(idx, 0, newGrid);
            patternScales.splice(idx, 0, currentScale);

            if (editingPatternIndex >= idx) editingPatternIndex++;
            if (playbackPatternIndex >= idx) playbackPatternIndex++;
            if (loopLockedPatternIndex >= idx) loopLockedPatternIndex++;
            if (queuedPatternIndex >= idx) queuedPatternIndex++;

            editingPatternIndex = idx;

            renderEditor();
            updateTimelineVisuals();
            triggerDebouncedSave();
            showToast("Pattern Inserted");
        }

        function deletePattern(idx) {
            if (song.length <= 1) {
                showToast("Cannot delete last part");
                return;
            }
            pushToHistory();
            song.splice(idx, 1);
            patternScales.splice(idx, 1);

            if (editingPatternIndex === idx) {
                editingPatternIndex = Math.max(0, idx - 1);
            } else if (editingPatternIndex > idx) {
                editingPatternIndex--;
            }

            if (playbackPatternIndex > idx) playbackPatternIndex--;
            else if (playbackPatternIndex === idx) {
                if (playbackPatternIndex >= song.length) playbackPatternIndex = 0;
            }

            if (loopLockedPatternIndex === idx) loopLockedPatternIndex = -1;
            else if (loopLockedPatternIndex > idx) loopLockedPatternIndex--;

            if (queuedPatternIndex === idx) queuedPatternIndex = -1;
            else if (queuedPatternIndex > idx) queuedPatternIndex--;

            renderEditor();
            updateTimelineVisuals();
            triggerDebouncedSave();
            showToast("Part deleted");
        }

        function updateTimelineVisuals() {
            const container = document.getElementById('timelineContainer');
            if (!container) return;
            const scrubber = document.getElementById('scrubber');
            container.innerHTML = '';
            container.appendChild(scrubber);

            let marqueeEl = document.getElementById('timelineMarquee');
            if (!marqueeEl) {
                marqueeEl = document.createElement('div');
                marqueeEl.id = 'timelineMarquee';
                marqueeEl.className = 'absolute border border-sky-400 bg-sky-400/20 z-50 pointer-events-none hidden';
            }
            container.appendChild(marqueeEl);

            let effectiveCount = song.length;
            let lastNonEmpty = song.length - 1;
            while (lastNonEmpty > 0 && isPatternEmpty(song[lastNonEmpty])) { lastNonEmpty--; }
            effectiveCount = lastNonEmpty + 1;

            const totalSecs = effectiveCount * STEPS_PER_PATTERN * (60.0 / bpm / 4);
            const tm = Math.floor(totalSecs / 60);
            const ts = Math.floor(totalSecs % 60);
            document.getElementById('totalTime').innerText = `${tm}:${ts.toString().padStart(2, '0')}`;

            song.forEach((pData, idx) => {
                // Inserter
                const inserter = document.createElement('div');
                inserter.className = 'timeline-inserter group cursor-pointer';
                inserter.innerHTML = `
                    <div class="w-0.5 h-full bg-slate-700/50 group-hover:bg-sky-500/50 transition-colors"></div>
                    <div class="absolute w-5 h-5 bg-slate-800 rounded-full border border-slate-600 flex items-center justify-center opacity-0 group-hover:opacity-100 group-hover:scale-110 transition-all shadow-lg z-40 text-sky-400">
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    </div>
                `;
                inserter.onclick = (e) => { e.stopPropagation(); insertPattern(idx); };
                container.appendChild(inserter);

                // Clip
                const clip = document.createElement('div');
                const isEditing = idx === editingPatternIndex;
                const isSelected = selectedParts.has(idx);
                const isQueued = idx === queuedPatternIndex;
                const isLocked = idx === loopLockedPatternIndex;
                const isEmpty = isPatternEmpty(pData);
                clip.id = `clip-${idx}`;
                clip.dataset.idx = idx;

                let classes = `timeline-clip p-3 rounded-2xl border flex flex-col justify-between group cursor-pointer overflow-hidden `;
                if (isEditing) classes += 'active-edit ';
                if (isSelected) classes += 'border-sky-500 shadow-[0_0_15px_rgba(56,189,248,0.4)] ';
                else if (isEmpty) classes += 'border-slate-800 bg-slate-900/10 border-dashed ';
                else classes += 'border-slate-800 bg-slate-900/40 ';

                if (isLocked) classes += 'loop-locked '; else if (isQueued) classes += 'queued ';
                clip.className = classes;

                clip.onclick = (e) => {
                    if (e.target.closest('.delete-btn')) return;
                    if (isTimelineBusy) { isTimelineBusy = false; return; }

                    if (e.shiftKey || e.ctrlKey || e.metaKey) {
                        if (selectedParts.has(idx)) selectedParts.delete(idx);
                        else selectedParts.add(idx);
                    } else {
                        selectedParts.clear(); selectedParts.add(idx);
                        editingPatternIndex = idx; isFollowMode = true;
                        const toggle = document.getElementById('followToggle');
                        if (toggle) toggle.checked = true;
                    }
                    selectedNotes.clear(); renderEditor(); updateTimelineVisuals();
                };
                clip.ondblclick = (e) => {
                    if (e.target.closest('.delete-btn')) return;
                    if (isPlaying) { queuedPatternIndex = idx; updateTimelineVisuals(); }
                };
                clip.oncontextmenu = (e) => {
                    e.preventDefault();
                    if (loopLockedPatternIndex === idx) loopLockedPatternIndex = -1; else loopLockedPatternIndex = idx;
                    updateTimelineVisuals();
                };
                clip.onmousedown = (e) => {
                    if (e.button === 1) { e.preventDefault(); deletePattern(idx); }
                };

                const header = document.createElement('div');
                header.className = 'flex justify-between items-start z-10 mb-2 relative';
                header.innerHTML = `
                    <span class="text-[9px] font-black ${isEditing ? 'text-sky-400' : 'text-slate-600'} uppercase tracking-widest">Part ${idx + 1}</span>
                    <button class="delete-btn opacity-0 group-hover:opacity-100 text-slate-600 hover:text-rose-500 transition-all p-1 hover:bg-slate-800/50 rounded">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                    ${isQueued ? '<div class="absolute top-0 right-6 bg-violet-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded animate-pulse">NEXT</div>' : ''}
                    ${isLocked ? '<div class="absolute top-0 right-6 bg-amber-500 text-slate-900 text-[8px] font-black px-1.5 py-0.5 rounded flex items-center gap-1 shadow-lg"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> LOOP</div>' : ''}
                `;
                header.querySelector('.delete-btn').onclick = (e) => {
                    e.stopPropagation(); deletePattern(idx);
                };

                const preview = document.createElement('div');
                preview.className = 'grid grid-cols-16 gap-0.5 h-full opacity-60 pointer-events-none';
                const configs = getRowConfigs(patternScales[idx]);
                for (let s = 0; s < STEPS_PER_PATTERN; s++) {
                    const col = document.createElement('div');
                    col.className = 'flex flex-col-reverse gap-px h-full justify-end';
                    for (let r = 0; r < pData.length; r++) {
                        const d = document.createElement('div');
                        if (pData[r][s]) {
                            const color = configs[r] ? configs[r].activeColor : 'bg-slate-500';
                            d.className = `w-full h-[3px] rounded-full ${color}`;
                        } else {
                            d.className = 'w-full h-[3px] rounded-full bg-slate-800/30';
                        }
                        col.appendChild(d);
                    }
                    preview.appendChild(col);
                }

                clip.appendChild(header); clip.appendChild(preview); container.appendChild(clip);
            });

            // Add Block
            const addBlock = document.createElement('div');
            addBlock.className = 'timeline-clip min-w-[60px] ml-1 flex flex-col border border-slate-800 bg-slate-900/20 rounded-2xl overflow-hidden group opacity-60 hover:opacity-100 transition-all';

            const addBtn = document.createElement('div');
            addBtn.className = 'flex-1 flex items-center justify-center cursor-pointer hover:bg-slate-800/60 hover:text-white text-slate-600 border-b border-slate-800/50 transition-colors';
            addBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>';
            addBtn.title = "Add Empty Pattern";

            addBtn.onclick = () => { insertPattern(song.length); };

            const dupBtn = document.createElement('div');
            dupBtn.className = 'flex-1 flex items-center justify-center cursor-pointer hover:bg-slate-800/60 hover:text-white text-slate-600 transition-colors';
            dupBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
            dupBtn.title = "Duplicate Previous";

            dupBtn.onclick = () => {
                if (song.length === 0) return;
                pushToHistory();
                const lastPattern = song[song.length - 1];
                const lastScale = patternScales[patternScales.length - 1];

                song.push(JSON.parse(JSON.stringify(lastPattern)));
                patternScales.push(lastScale);

                editingPatternIndex = song.length - 1;
                selectedNotes.clear();
                renderEditor();
                updateTimelineVisuals();
                triggerDebouncedSave();
                setTimeout(() => {
                    const wrapper = document.getElementById('timelineWrapper');
                    if (wrapper) wrapper.scrollTo({ left: wrapper.scrollWidth, behavior: 'smooth' });
                }, 10);
                showToast("Pattern duplicated");
            };

            addBlock.appendChild(addBtn);
            addBlock.appendChild(dupBtn);
            container.appendChild(addBlock);
        }

        // --- Handlers ---

        function startNoteResizing(e, r, c) {
            isResizingNote = true;
            resizeStart = { x: e.clientX, y: e.clientY };
            resizeNotePos = { r, c };
            const note = song[editingPatternIndex][r][c];
            resizeStartDuration = note ? (note.d || 1) : 1;
            cachedGridRect = document.getElementById('gridContainer').getBoundingClientRect();
            const firstCell = document.querySelector('.step');
            cachedCellWidth = firstCell ? (firstCell.offsetWidth + 6) : 40;
        }

        function handleGridMouseDown(e) {
            if (e.button !== 0) return; // Left click only

            const container = document.getElementById('gridContainer');
            cachedGridRect = container.getBoundingClientRect();

            // Get single cell metrics for calculations
            const firstCell = container.querySelector('.step');
            if (firstCell) {
                cachedCellWidth = firstCell.offsetWidth + 6; // + gap
                cachedCellHeight = firstCell.offsetHeight + 6; // + gap
            } else {
                cachedCellWidth = 40; cachedCellHeight = 40;
            }

            const x = e.clientX - cachedGridRect.left;
            const y = e.clientY - cachedGridRect.top;

            // Check if clicked on a note
            const target = e.target.closest('.step');

            if (e.ctrlKey || e.metaKey) {
                // Check if Copy-Dragging (Ctrl + Click on ALREADY SELECTED note)
                if (target && target.classList.contains('selected')) {
                    isDragging = true;
                    isCopyDrag = true;
                    dragDirection = null;
                    dragStart = { x: e.clientX, y: e.clientY };

                    dragStartSelection = [];

                    // Create Clones for visual feedback
                    selectedNotes.forEach(key => {
                        const [r, c] = key.split(',').map(Number);
                        const originalEl = container.querySelector(`.step[data-r="${r}"][data-c="${c}"]`);
                        if (originalEl) {
                            const clone = originalEl.cloneNode(true);
                            clone.classList.remove('selected', 'active'); // Visual style for clone
                            clone.classList.add('bg-white/50', 'border-white'); // Ghost style
                            clone.style.position = 'absolute';
                            clone.style.zIndex = '100';
                            clone.style.left = originalEl.offsetLeft + 'px';
                            clone.style.top = originalEl.offsetTop + 'px';
                            clone.style.width = originalEl.offsetWidth + 'px';
                            clone.style.height = originalEl.offsetHeight + 'px';
                            clone.style.margin = '0';

                            container.appendChild(clone);
                            dragStartSelection.push({ r, c, el: clone });
                        }
                    });

                    return; // Skip marquee logic
                }

                // Marquee Start (Ctrl + Click on background or unselected)
                isSelecting = true;
                selectionStart = { x, y };
                const marquee = document.getElementById('selectionMarquee');
                marquee.style.left = x + 'px';
                marquee.style.top = y + 'px';
                marquee.style.width = '0px';
                marquee.style.height = '0px';
                marquee.style.display = 'block';
                // Don't clear selection if adding? Standard behavior is new selection
                if (!e.shiftKey) {
                    selectedNotes.clear();
                    renderEditor();
                }
            } else if (target && target.classList.contains('selected')) {
                // Start Normal Dragging (Move)
                isDragging = true;
                isCopyDrag = false;
                dragDirection = null;
                dragStart = { x: e.clientX, y: e.clientY };

                dragStartSelection = [];
                selectedNotes.forEach(key => {
                    const [r, c] = key.split(',').map(Number);
                    dragStartSelection.push({ r, c, el: document.querySelector(`.step[data-r="${r}"][data-c="${c}"]`) });
                });
            } else if (target) {
                // If we have a selection and click an unselected cell, just deselect
                if (selectedNotes.size > 0 && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                    selectedNotes.clear();
                    renderEditor();
                    return;
                }

                // Regular Click Logic (Toggle Note)
                const r = parseInt(target.dataset.r);
                const c = parseInt(target.dataset.c);
                const currentGrid = song[editingPatternIndex];

                pushToHistory();
                if (currentGrid[r][c]) {
                    currentGrid[r][c] = null;
                } else {
                    currentGrid[r][c] = { d: desiredNoteDuration, o: 0 };
                }

                if (currentGrid[r][c] && audioCtx) {
                    if (audioCtx.state === 'suspended') audioCtx.resume();
                    const now = audioCtx.currentTime;
                    const configs = getRowConfigs(patternScales[editingPatternIndex]);
                    const config = configs[r];

                    if (config.label === 'Kick') createKick(now);
                    else if (config.label === 'Snare') createSnare(now);
                    else if (config.label === 'Hi-Hat') createHiHat(now);
                    else if (config.type === 'custom') createTom(now, config.freq);
                    else if (config.freq) createSynth(config.freq, now, 1);
                }

                if (!e.shiftKey && selectedNotes.size > 0) {
                    selectedNotes.clear();
                }

                renderEditor();
                updateTimelineVisuals();
                triggerDebouncedSave();
            } else {
                // Click on background
                selectedNotes.clear();
                renderEditor();
            }
        }

        function handleWindowMouseMove(e) {
            if (isSelecting) {
                // Efficient math-based selection
                const currentX = e.clientX - cachedGridRect.left;
                const currentY = e.clientY - cachedGridRect.top;

                const width = Math.abs(currentX - selectionStart.x);
                const height = Math.abs(currentY - selectionStart.y);
                const left = Math.min(currentX, selectionStart.x);
                const top = Math.min(currentY, selectionStart.y);

                const marquee = document.getElementById('selectionMarquee');
                marquee.style.width = width + 'px';
                marquee.style.height = height + 'px';
                marquee.style.left = left + 'px';
                marquee.style.top = top + 'px';

                const steps = document.getElementById('gridContainer').children;
                for (let i = 0; i < steps.length; i++) {
                    const el = steps[i];
                    if (!el.classList.contains('step')) continue;

                    const elLeft = el.offsetLeft;
                    const elTop = el.offsetTop;
                    const elW = el.offsetWidth;
                    const elH = el.offsetHeight;

                    if (left < elLeft + elW && left + width > elLeft &&
                        top < elTop + elH && top + height > elTop) {
                        const r = el.dataset.r;
                        const c = el.dataset.c;
                        if (!selectedNotes.has(`${r},${c}`)) {
                            selectedNotes.add(`${r},${c}`);
                            el.classList.add('selected');
                        }
                    }
                }

            } else if (isDragging) {
                const deltaX = e.clientX - dragStart.x;
                const deltaY = e.clientY - dragStart.y;

                // Determine Axis Lock if not yet set
                if (!dragDirection) {
                    // Threshold of 10px to decide direction
                    if (Math.abs(deltaX) > 10) dragDirection = 'h';
                    else if (Math.abs(deltaY) > 10) dragDirection = 'v';
                }

                // Apply visual transform based on locked axis
                if (dragDirection === 'h') {
                    dragStartSelection.forEach(item => {
                        if (item.el) {
                            item.el.style.transform = `translateX(${deltaX}px)`;
                            item.el.style.zIndex = 50;
                        }
                    });
                } else if (dragDirection === 'v') {
                    dragStartSelection.forEach(item => {
                        if (item.el) {
                            item.el.style.transform = `translateY(${deltaY}px)`;
                            item.el.style.zIndex = 50;
                        }
                    });
                }
            } else if (isResizingNote) {
                const deltaX = e.clientX - resizeStart.x;
                const stepDelta = deltaX / (cachedCellWidth || 40);
                const currentGrid = song[editingPatternIndex];
                const note = currentGrid[resizeNotePos.r][resizeNotePos.c];

                if (note) {
                    let newDuration = resizeStartDuration + stepDelta;
                    if (!e.altKey) {
                        newDuration = Math.max(1, Math.round(newDuration));
                    } else {
                        newDuration = Math.max(0.1, newDuration);
                    }

                    // Cap at pattern boundary
                    if (resizeNotePos.c + newDuration > STEPS_PER_PATTERN) {
                        newDuration = STEPS_PER_PATTERN - resizeNotePos.c;
                    }

                    note.d = newDuration;

                    // Live visual update
                    const el = document.querySelector(`.step[data-r="${resizeNotePos.r}"][data-c="${resizeNotePos.c}"]`);
                    if (el) {
                        const span = Math.min(newDuration, STEPS_PER_PATTERN - resizeNotePos.c);
                        const cellsRemainingInSpan = Math.ceil(span);
                        el.style.gridColumn = `span ${cellsRemainingInSpan}`;
                        el.style.width = `${(span / cellsRemainingInSpan) * 100}%`;
                    }
                }
            }
        }

        function handleWindowMouseUp(e) {
            if (isSelecting) {
                isSelecting = false;
                document.getElementById('selectionMarquee').style.display = 'none';
            } else if (isResizingNote) {
                isResizingNote = false;
                renderEditor();
                triggerDebouncedSave();
            } else if (isDragging) {
                isDragging = false;
                const currentGrid = song[editingPatternIndex];

                // Calculate discrete steps moved
                const deltaX = e.clientX - dragStart.x;
                const deltaY = e.clientY - dragStart.y;
                let moved = false;

                if (dragDirection === 'h') {
                    const stepDeltaTotal = deltaX / (cachedCellWidth || 40);
                    let finalDelta = stepDeltaTotal;
                    if (!e.altKey) {
                        finalDelta = Math.round(stepDeltaTotal);
                    }

                    if (finalDelta !== 0) {
                        pushToHistory();
                        moved = true;
                        const tempGrid = currentGrid.map(row => [...row]);

                        // If Moving (not copying), clear old positions first
                        if (!isCopyDrag) {
                            selectedNotes.forEach(key => {
                                const [r, c] = key.split(',').map(Number);
                                if (currentGrid[r][c]) tempGrid[r][c] = null;
                            });
                        }

                        const newSelection = new Set();
                        dragStartSelection.forEach(item => {
                            const newC = item.c + finalDelta;
                            if (newC >= 0 && newC < STEPS_PER_PATTERN) {
                                // If unsnapped, we might need a more complex structure, 
                                // but for now we round the Column Index and store the offset in the note if needed?
                                // Actually, let's keep the Column Index as the "Start Step" and d as duration.
                                // If unsnapped, we can have a fractional 'c'.
                                // Wait, the grid array is index-based.
                                // To support un-snapped movement, we'd need to change from a 2D array to a list of notes with x/y.
                                // But the prompt says "stretch out... and holding alt will un-snap".
                                // If I stay with the 2D array, I can't easily have fractional 'c'.
                                // I will use the 'o' (offset) property in the note object for un-snapped starts.

                                const noteData = JSON.parse(JSON.stringify(currentGrid[item.r][item.c]));
                                const cIndex = Math.floor(newC);
                                const offset = newC - cIndex;
                                noteData.o = offset; // Offset from step start

                                newSelection.add(`${item.r},${cIndex}`);
                                tempGrid[item.r][cIndex] = noteData;
                            }
                        });

                        song[editingPatternIndex] = tempGrid;
                        selectedNotes = newSelection;
                        updateTimelineVisuals();
                        triggerDebouncedSave();
                    }
                } else if (dragDirection === 'v') {
                    const rowDelta = Math.round(deltaY / (cachedCellHeight || 40));

                    if (rowDelta !== 0) {
                        pushToHistory();
                        moved = true;
                        const tempGrid = currentGrid.map(row => [...row]);

                        if (!isCopyDrag) {
                            selectedNotes.forEach(key => {
                                const [r, c] = key.split(',').map(Number);
                                if (currentGrid[r][c]) tempGrid[r][c] = null;
                            });
                        }

                        const newSelection = new Set();
                        dragStartSelection.forEach(item => {
                            const newR = item.r + rowDelta;
                            if (newR >= 0 && newR < currentGrid.length) {
                                newSelection.add(`${newR},${item.c}`);
                                if (currentGrid[item.r][item.c]) tempGrid[newR][item.c] = JSON.parse(JSON.stringify(currentGrid[item.r][item.c]));
                            }
                        });

                        song[editingPatternIndex] = tempGrid;
                        selectedNotes = newSelection;
                        updateTimelineVisuals();
                        triggerDebouncedSave();
                    }
                }

                // Cleanup visuals
                dragStartSelection.forEach(item => {
                    if (item.el) {
                        item.el.style.transform = '';
                        item.el.style.zIndex = '';
                        if (isCopyDrag) item.el.remove(); // Remove clones
                    }
                });

                if (moved && isCopyDrag) showToast("Notes Copied");

                dragDirection = null;
                isCopyDrag = false;
                renderEditor();
            }
        }

        // --- Timeline Interaction Handlers ---

        function handleTimelineMouseDown(e) {
            if (e.button !== 0) return;
            isTimelineBusy = false;

            const container = document.getElementById('timelineContainer');
            const rect = container.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const target = e.target.closest('.timeline-clip');

            if (e.ctrlKey || e.metaKey) {
                if (target && selectedParts.has(parseInt(target.dataset.idx))) {
                    isTimelineWaitingToDrag = true;
                    isTimelineCopyDrag = true;
                    timelineDragStart = { x: e.clientX, y: e.clientY };
                    timelineDragStartIndex = parseInt(target.dataset.idx);
                    return;
                }

                // Start marquee selection
                isTimelineSelecting = true;
                timelineSelectionStart = { x, y };
                const marquee = document.getElementById('timelineMarquee');
                marquee.style.left = x + 'px';
                marquee.style.top = y + 'px';
                marquee.style.width = '0px';
                marquee.style.height = '0px';
                marquee.style.display = 'block';

                if (!e.shiftKey) {
                    selectedParts.clear();
                    updateTimelineVisuals();
                }
            } else if (target) {
                if (selectedParts.has(parseInt(target.dataset.idx))) {
                    isTimelineWaitingToDrag = true;
                    isTimelineCopyDrag = false;
                    timelineDragStart = { x: e.clientX, y: e.clientY };
                    timelineDragStartIndex = parseInt(target.dataset.idx);
                }
            } else {
                selectedParts.clear();
                updateTimelineVisuals();
            }
        }

        function handleTimelineMouseMove(e) {
            const container = document.getElementById('timelineContainer');
            if (!container) return;
            const rect = container.getBoundingClientRect();

            if (isTimelineSelecting) {
                const currentX = e.clientX - rect.left;
                const currentY = e.clientY - rect.top;

                const width = Math.abs(currentX - timelineSelectionStart.x);
                const height = Math.abs(currentY - timelineSelectionStart.y);
                const left = Math.min(currentX, timelineSelectionStart.x);
                const top = Math.min(currentY, timelineSelectionStart.y);

                const marquee = document.getElementById('timelineMarquee');
                marquee.style.width = width + 'px';
                marquee.style.height = height + 'px';
                marquee.style.left = left + 'px';
                marquee.style.top = top + 'px';

                const clips = container.querySelectorAll('.timeline-clip');
                clips.forEach(clip => {
                    const cLeft = clip.offsetLeft;
                    const cTop = clip.offsetTop;
                    const cW = clip.offsetWidth;
                    const cH = clip.offsetHeight;

                    if (left < cLeft + cW && left + width > cLeft &&
                        top < cTop + cH && top + height > cTop) {
                        selectedParts.add(parseInt(clip.dataset.idx));
                    }
                });
                updateTimelineVisuals();
            } else if (isTimelineWaitingToDrag) {
                const deltaX = Math.abs(e.clientX - timelineDragStart.x);
                const deltaY = Math.abs(e.clientY - timelineDragStart.y);
                if (deltaX > 8 || deltaY > 8) {
                    isTimelineWaitingToDrag = false;
                    isTimelineDragging = true;
                }
            } else if (isTimelineDragging) {
                // Visual feedback for dragging could be added here
            }
        }

        function handleTimelineMouseUp(e) {
            isTimelineWaitingToDrag = false;

            if (isTimelineSelecting) {
                isTimelineSelecting = false;
                document.getElementById('timelineMarquee').style.display = 'none';
                isTimelineBusy = true; // Block the click event
            } else if (isTimelineDragging) {
                isTimelineDragging = false;
                isTimelineBusy = true; // Block the click event
                const container = document.getElementById('timelineContainer');
                const clips = Array.from(container.querySelectorAll('.timeline-clip'));

                // Find where we dropped
                let dropIndex = -1;
                const rect = container.getBoundingClientRect();
                const x = e.clientX - rect.left;

                // Simple logic: find which clip we are over or between
                for (let i = 0; i < clips.length; i++) {
                    const c = clips[i];
                    if (x < c.offsetLeft + (c.offsetWidth / 2)) {
                        dropIndex = i;
                        break;
                    }
                }
                if (dropIndex === -1) dropIndex = song.length;

                if (selectedParts.size > 0) {
                    pushToHistory();

                    const sortedSelected = Array.from(selectedParts).sort((a, b) => a - b);
                    const movedPatterns = sortedSelected.map(idx => song[idx]);
                    const movedScales = sortedSelected.map(idx => patternScales[idx]);

                    if (isTimelineCopyDrag) {
                        // Insert duplicates at dropIndex
                        song.splice(dropIndex, 0, ...JSON.parse(JSON.stringify(movedPatterns)));
                        patternScales.splice(dropIndex, 0, ...movedScales);

                        // Select new copies
                        selectedParts.clear();
                        for (let i = 0; i < movedPatterns.length; i++) {
                            selectedParts.add(dropIndex + i);
                        }
                        showToast("Parts Duplicated");
                    } else {
                        // Move: remove old, insert new
                        const newSong = [];
                        const newScales = [];

                        // Build list of non-selected
                        for (let i = 0; i < song.length; i++) {
                            if (!selectedParts.has(i)) {
                                if (newSong.length === dropIndex) {
                                    newSong.push(...movedPatterns);
                                    newScales.push(...movedScales);
                                }
                                newSong.push(song[i]);
                                newScales.push(patternScales[i]);
                            }
                        }
                        if (newSong.length <= dropIndex) {
                            newSong.push(...movedPatterns);
                            newScales.push(...movedScales);
                        }

                        song = newSong;
                        patternScales = newScales;

                        // Re-select moved parts
                        selectedParts.clear();
                        let finalIdx = -1;
                        for (let i = 0; i < song.length; i++) {
                            if (song[i] === movedPatterns[0]) {
                                finalIdx = i;
                                break;
                            }
                        }
                        for (let i = 0; i < movedPatterns.length; i++) {
                            selectedParts.add(finalIdx + i);
                        }
                        showToast("Parts Moved");
                    }

                    renderEditor();
                    updateTimelineVisuals();
                    triggerDebouncedSave();
                }
            }
        }

        function handleContinue() {
            if (!isPlaying) return;
            pushToHistory();
            const card = document.getElementById('editorCard');
            card.style.transform = 'translateY(-10px) scale(0.99)'; card.style.opacity = '0.8';
            setTimeout(() => {
                const currentGrid = song[editingPatternIndex];
                const newGrid = currentGrid.map(row => [...row]);
                song.push(newGrid);
                patternScales.push(patternScales[editingPatternIndex]);
                editingPatternIndex = song.length - 1;
                selectedNotes.clear();
                renderEditor(); updateTimelineVisuals();
                card.style.transform = 'translateY(0) scale(1)'; card.style.opacity = '1';
                setTimeout(() => { const wrapper = document.getElementById('timelineWrapper'); if (wrapper) wrapper.scrollTo({ left: wrapper.scrollWidth, behavior: 'smooth' }); }, 50);
                triggerDebouncedSave();
            }, 100);
        }

        function handleReset() {
            const btn = document.getElementById('resetBtn');
            if (btn.innerText === 'CONFIRM?') {
                if (isPlaying) togglePlay();
                pushToHistory();
                isUnrolled = false;
                currentScale = 'C Maj Pent';
                song = [generateBlankGrid(false)];
                patternScales = ['C Maj Pent'];
                drumRows = JSON.parse(JSON.stringify(DEFAULT_DRUM_ROWS)); // Reset Drums
                soundConfig = JSON.parse(JSON.stringify(DEFAULT_SOUND_CONFIG)); // Reset Sounds
                bpm = 120;
                editingPatternIndex = 0; playbackPatternIndex = 0; playbackStepIndex = 0;
                queuedPatternIndex = -1; loopLockedPatternIndex = -1;
                selectedNotes.clear();

                document.getElementById('bpmInput').value = bpm;
                document.getElementById('scaleSelect').value = currentScale;
                document.getElementById('scaleSelect').disabled = false;
                document.getElementById('scaleSelect').classList.remove('opacity-50');
                document.getElementById('unrollBtn').classList.remove('unroll-active');

                btn.innerText = 'RESET'; btn.classList.remove('reset-confirm');
                renderEditor(); updateTimelineVisuals(); triggerDebouncedSave();
            } else {
                btn.innerText = 'CONFIRM?'; btn.classList.add('reset-confirm');
                clearTimeout(resetTimeout); resetTimeout = setTimeout(() => { btn.innerText = 'RESET'; btn.classList.remove('reset-confirm'); }, 3000);
            }
        }

        function togglePlay() {
            if (!audioCtx) return;
            if (audioCtx.state === 'suspended') audioCtx.resume();

            isPlaying = !isPlaying;

            const playBtn = document.getElementById('playBtn');
            const playIcon = document.getElementById('playIcon');
            const playText = document.getElementById('playText');
            const contBtn = document.getElementById('continueBtn');
            const scrubber = document.getElementById('scrubber');
            const songTime = document.getElementById('songTime');

            if (isPlaying) {
                playbackPatternIndex = editingPatternIndex;
                playbackStepIndex = 0;
                nextNoteTime = audioCtx.currentTime;
                scheduler();

                if (playBtn) playBtn.classList.replace('bg-sky-500', 'bg-amber-500');
                if (playIcon) playIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
                if (playText) playText.innerText = 'STOP';
                if (contBtn) contBtn.disabled = false;
            } else {
                clearTimeout(timerID);

                if (playBtn) playBtn.classList.replace('bg-amber-500', 'bg-sky-500');
                if (playIcon) playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
                if (playText) playText.innerText = 'START';
                if (contBtn) contBtn.disabled = true;

                document.querySelectorAll('.step').forEach(s => s.classList.remove('playing'));
                if (songTime) songTime.innerText = '0:00';
                if (scrubber) scrubber.classList.add('hidden');

                queuedPatternIndex = -1;
            }
            updateTimelineVisuals();
        }

        // Modal Handlers
        function openAiModal() {
            const aiModal = document.getElementById('aiModal');
            const aiModalContent = document.getElementById('aiModalContent');
            const aiInput = document.getElementById('aiPromptInput');
            aiModal.classList.remove('hidden');
            const lastPrompt = localStorage.getItem('pulse_last_ai_prompt');
            if (lastPrompt) { aiInput.placeholder = `Last used: "${lastPrompt}" (Press Enter to reuse)`; }
            else { aiInput.placeholder = "E.g., Simple house beat with a heavy kick..."; }
            aiInput.value = '';
            setTimeout(() => { aiModal.classList.remove('opacity-0'); aiModalContent.classList.remove('scale-95'); aiModalContent.classList.add('scale-100'); }, 10);
            aiInput.focus();
        }
        function closeAiModal() {
            const aiModal = document.getElementById('aiModal');
            const aiModalContent = document.getElementById('aiModalContent');
            aiModal.classList.add('opacity-0'); aiModalContent.classList.remove('scale-100'); aiModalContent.classList.add('scale-95'); setTimeout(() => { aiModal.classList.add('hidden'); }, 300);
        }

        function initAudio() {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            document.getElementById('welcomeOverlay').style.opacity = '0';
            setTimeout(() => document.getElementById('welcomeOverlay').style.display = 'none', 700);
            renderEditor(); updateTimelineVisuals();
        }

        // --- Initialization and Event Listeners ---
        function setupEventListeners() {
            const getEl = (id) => {
                const el = document.getElementById(id);
                if (!el) console.warn(`Element with ID '${id}' not found.`);
                return el;
            };

            // Main Controls
            const initBtn = getEl('initBtn');
            if (initBtn) initBtn.onclick = initAudio;

            const playBtn = getEl('playBtn');
            if (playBtn) playBtn.onclick = togglePlay;

            const continueBtn = getEl('continueBtn');
            if (continueBtn) continueBtn.onclick = handleContinue;

            const resetBtn = getEl('resetBtn');
            if (resetBtn) resetBtn.onclick = handleReset;

            const undoBtn = getEl('undoBtn');
            if (undoBtn) undoBtn.onclick = undo;

            const redoBtn = getEl('redoBtn');
            if (redoBtn) redoBtn.onclick = redo;

            const bpmInput = getEl('bpmInput');
            if (bpmInput) bpmInput.onchange = (e) => {
                pushToHistory();
                bpm = Math.max(40, Math.min(240, e.target.value));
                e.target.value = bpm;
                triggerDebouncedSave();
            };

            // Arrangement Controls
            const followToggle = getEl('followToggle');
            if (followToggle) followToggle.addEventListener('change', (e) => { isFollowMode = e.target.checked; });

            const unrollBtn = getEl('unrollBtn');
            if (unrollBtn) unrollBtn.onclick = toggleUnroll;

            const scaleSelect = getEl('scaleSelect');
            if (scaleSelect) scaleSelect.onchange = (e) => changeScale(e.target.value);

            // Random/AI Button
            const randomBtn = getEl('randomBtn');
            if (randomBtn) {
                // Left Click: Randomize Pattern
                randomBtn.onclick = () => generatePatternAI('random');

                // Right Click: Open Modal
                randomBtn.oncontextmenu = (e) => {
                    e.preventDefault();
                    openAiModal();
                };
            }

            // Remix Button
            const remixBtn = getEl('remixBtn');
            if (remixBtn) remixBtn.onclick = randomizeDrums;

            const closeAiBtn = getEl('closeAiBtn');
            if (closeAiBtn) closeAiBtn.onclick = closeAiModal;

            const generateAiBtn = getEl('generateAiBtn');
            if (generateAiBtn) generateAiBtn.onclick = () => generatePatternAI(); // Modal call

            const aiModal = getEl('aiModal');
            if (aiModal) aiModal.onclick = (e) => { if (e.target === aiModal) closeAiModal(); };

            // Share/Load
            const shareBtn = getEl('shareBtn');
            if (shareBtn) shareBtn.onclick = handleShare;

            const loadBtn = getEl('loadBtn');
            if (loadBtn) loadBtn.onclick = openLoadModal;

            const closeLoadBtn = getEl('closeLoadBtn');
            if (closeLoadBtn) closeLoadBtn.onclick = closeLoadModal;

            const confirmLoadBtn = getEl('confirmLoadBtn');
            if (confirmLoadBtn) confirmLoadBtn.onclick = handleConfirmLoad;

            const closeShareBtn = getEl('closeShareBtn');
            if (closeShareBtn) closeShareBtn.onclick = closeShareModal;

            const shareModal = getEl('shareModal');
            if (shareModal) shareModal.onclick = (e) => { if (e.target === shareModal) closeShareModal(); };

            const loadModal = getEl('loadModal');
            if (loadModal) loadModal.onclick = (e) => { if (e.target === loadModal) closeLoadModal(); };

            // Grid Interaction (Mouse Down)
            const gridContainer = getEl('gridContainer');
            if (gridContainer) {
                gridContainer.addEventListener('mousedown', handleGridMouseDown);
                gridContainer.addEventListener('wheel', (e) => {
                    e.preventDefault();
                    if (e.deltaY > 0) {
                        desiredNoteDuration = Math.max(0.125, desiredNoteDuration / 2);
                    } else {
                        desiredNoteDuration = Math.min(16, desiredNoteDuration * 2);
                    }
                    showToast(`Placement Duration: ${desiredNoteDuration} Steps`);
                }, { passive: false });
            }

            const timelineContainer = getEl('timelineContainer');
            if (timelineContainer) timelineContainer.addEventListener('mousedown', handleTimelineMouseDown);

            window.addEventListener('mousemove', (e) => {
                handleWindowMouseMove(e);
                handleTimelineMouseMove(e);
            });
            window.addEventListener('mouseup', (e) => {
                handleWindowMouseUp(e);
                handleTimelineMouseUp(e);
            });

            // Keyboard Shortcuts
            window.addEventListener('keydown', (e) => {
                const isAnyModalOpen = !document.getElementById('aiModal').classList.contains('hidden') ||
                    !document.getElementById('shareModal').classList.contains('hidden') ||
                    !document.getElementById('loadModal').classList.contains('hidden');

                if (e.key === 'Escape') {
                    if (aiModal && !aiModal.classList.contains('hidden')) closeAiModal();
                    if (shareModal && !shareModal.classList.contains('hidden')) closeShareModal();
                    if (loadModal && !loadModal.classList.contains('hidden')) closeLoadModal();
                    selectedParts.clear();
                    updateTimelineVisuals();
                    return;
                }

                const activeTag = document.activeElement.tagName.toLowerCase();
                if (activeTag === 'input' || activeTag === 'textarea') return;

                if (e.code === 'Space') {
                    e.preventDefault();
                    togglePlay();
                    return;
                }

                // Duplicate Shortcut (Ctrl+D)
                if (e.code === 'KeyD' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();

                    if (selectedParts.size > 0) {
                        pushToHistory();
                        const sorted = Array.from(selectedParts).sort((a, b) => a - b);
                        const insertAt = sorted[sorted.length - 1] + 1;
                        const duplicates = sorted.map(idx => JSON.parse(JSON.stringify(song[idx])));
                        const dupScales = sorted.map(idx => patternScales[idx]);

                        song.splice(insertAt, 0, ...duplicates);
                        patternScales.splice(insertAt, 0, ...dupScales);

                        selectedParts.clear();
                        for (let i = 0; i < sorted.length; i++) {
                            selectedParts.add(insertAt + i);
                        }

                        editingPatternIndex = insertAt;
                        renderEditor();
                        updateTimelineVisuals();
                        triggerDebouncedSave();
                        showToast("Parts Duplicated");
                        return;
                    }

                    if (song.length === 0) return;

                    pushToHistory();

                    // Clone current pattern
                    const currentPattern = song[editingPatternIndex];
                    const currentScaleName = patternScales[editingPatternIndex];

                    const newPattern = JSON.parse(JSON.stringify(currentPattern));

                    // Insert after
                    song.splice(editingPatternIndex + 1, 0, newPattern);
                    patternScales.splice(editingPatternIndex + 1, 0, currentScaleName);

                    // Select new duplicate
                    editingPatternIndex++;

                    renderEditor();
                    updateTimelineVisuals();
                    triggerDebouncedSave();

                    // Scroll to ensure visibility
                    setTimeout(() => {
                        const wrapper = document.getElementById('timelineWrapper');
                        const clip = document.getElementById(`clip-${editingPatternIndex}`);
                        if (wrapper && clip) {
                            if (clip.offsetLeft + clip.offsetWidth > wrapper.scrollLeft + wrapper.offsetWidth) {
                                wrapper.scrollTo({ left: clip.offsetLeft, behavior: 'smooth' });
                            }
                        }
                    }, 50);

                    showToast("Pattern Duplicated");
                    return;
                }

                // Copy/Paste Logic (Ctrl/Meta + C/V)
                if (e.ctrlKey || e.metaKey) {
                    if (e.code === 'KeyC') {
                        // Copy current pattern
                        patternClipboard = {
                            grid: JSON.parse(JSON.stringify(song[editingPatternIndex])),
                            scale: patternScales[editingPatternIndex]
                        };
                        showToast("Pattern Copied");
                    }
                    if (e.code === 'KeyV') {
                        if (patternClipboard) {
                            pushToHistory(); // Undo Point
                            if (e.shiftKey) {
                                // Paste Insert (Add To)
                                const newPattern = JSON.parse(JSON.stringify(patternClipboard.grid));
                                song.splice(editingPatternIndex + 1, 0, newPattern);
                                patternScales.splice(editingPatternIndex + 1, 0, patternClipboard.scale);
                                editingPatternIndex++; // Jump to the new part
                                showToast("Pattern Inserted");
                            } else {
                                // Paste Replace
                                song[editingPatternIndex] = JSON.parse(JSON.stringify(patternClipboard.grid));
                                patternScales[editingPatternIndex] = patternClipboard.scale;
                                showToast("Pattern Replaced");
                            }
                            renderEditor();
                            updateTimelineVisuals();
                            triggerDebouncedSave();

                            // Ensure timeline scrolls if we added something off screen
                            setTimeout(() => {
                                const wrapper = document.getElementById('timelineWrapper');
                                const clip = document.getElementById(`clip-${editingPatternIndex}`);
                                if (wrapper && clip) {
                                    if (clip.offsetLeft + clip.offsetWidth > wrapper.scrollLeft + wrapper.offsetWidth) {
                                        wrapper.scrollTo({ left: clip.offsetLeft, behavior: 'smooth' });
                                    }
                                }
                            }, 50);
                        }
                    }
                    // Undo/Redo Shortcuts
                    if (e.code === 'KeyZ') {
                        e.preventDefault();
                        if (e.shiftKey) redo();
                        else undo();
                    }
                    if (e.code === 'KeyY') {
                        e.preventDefault();
                        redo();
                    }
                }
            });

            // AI Input specific
            const aiInput = getEl('aiPromptInput');
            if (aiInput) {
                aiInput.addEventListener('keydown', (e) => {
                    if ((e.key === 'Enter' && !e.shiftKey) || (e.key === 'Enter' && e.ctrlKey)) {
                        e.preventDefault(); generatePatternAI();
                    }
                });
            }
        }

        // --- Start ---
        async function initApp() {
            setupEventListeners();

            if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                await signInWithCustomToken(auth, __initial_auth_token);
            } else {
                await signInAnonymously(auth);
            }

            onAuthStateChanged(auth, (user) => {
                const urlParams = new URLSearchParams(window.location.search);
                const sharedSongId = urlParams.get('song');
                if (sharedSongId) {
                    loadSharedSong(sharedSongId);
                    currentUser = user;
                } else if (user) {
                    currentUser = user;
                    loadFromCloud(user);
                }
            });

            renderEditor();
        }

        // Wait for DOM
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initApp);
        } else {
            initApp();
        }
    