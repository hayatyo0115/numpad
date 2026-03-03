
(function() {

window.addEventListener('error', function(e) {
    console.error(`Unhandled error: Line: ${e.lineno}, Column: ${e.colno}, Message: ${e.message}`);
});

// SECURITY PATCH START: DoS Protection - Element Count Limit
const MAX_BLOCKS = 200;
// SECURITY PATCH END: DoS Protection - Element Count Limit

// SECURITY PATCH START: Show UI notification for security warnings
function showSecurityNotification(message) {
    let notifier = document.querySelector('.security-notifier');
    if (!notifier) {
        notifier = document.createElement('div');
        notifier.className = 'security-notifier';
        document.body.appendChild(notifier);
    }
    
    notifier.textContent = message;
    notifier.style.opacity = '1';

    setTimeout(() => {
        notifier.style.opacity = '0';
    }, 3000);
}
// SECURITY PATCH END: Show UI notification for security warnings

// StateManager クラスの定義
class StateManager {
    constructor() {
        this.blocks = new Map(); // id -> Block オブジェクトのマップ
        this.blockIdCounter = 0;
        this.canvas = null; 
    }

    _createBlockData(id, type, value, x, y, parentGroupId = null) {
        return { id, type, value, x, y, parentGroupId, children: [], domElement: null };
    }

    addBlock(type, value, x, y, parentGroupId = null) {
        // SECURITY PATCH START: DoS Protection - Enforce element limit
        if (this.blocks.size >= MAX_BLOCKS) {
            console.warn(`[SECURITY] Element limit reached. Cannot create more blocks. Limit: ${MAX_BLOCKS}`);
            showSecurityNotification(`要素数の上限(${MAX_BLOCKS})に達しました。`);
            return null;
        }
        // SECURITY PATCH END: DoS Protection - Enforce element limit

        const id = `${type}-${this.blockIdCounter++}`;
        const newBlockData = this._createBlockData(id, type, value, x, y, parentGroupId);
        this.blocks.set(id, newBlockData);
        if (parentGroupId) {
            const parent = this.blocks.get(parentGroupId);
            if (parent) parent.children.push(id);
        }
        return newBlockData;
    }

    removeBlock(id) {
        const blockToRemove = this.blocks.get(id);
        if (!blockToRemove) return false;
        if (blockToRemove.type === 'group') {
            [...blockToRemove.children].forEach(childId => this.removeBlock(childId));
        }
        if (blockToRemove.parentGroupId) {
            const parent = this.blocks.get(blockToRemove.parentGroupId);
            if (parent) parent.children = parent.children.filter(childId => childId !== id);
        }
        this.blocks.delete(id);
        return true;
    }

    updateBlockPosition(id, x, y) {
        const block = this.blocks.get(id);
        if (block) {
            block.x = x;
            block.y = y;
            return true;
        }
        return false;
    }

    _rebuildDomFromState() {
        const rootBlocks = Array.from(this.blocks.values()).filter(block => !block.parentGroupId);
        rootBlocks.forEach(blockData => this._renderBlockDom(blockData, this.canvas));
        this.blocks.forEach(blockData => {
            if (blockData.type === 'group') {
                const groupEl = this.blocks.get(blockData.id).domElement;
                if (groupEl) updateGroupBoundingBox(groupEl); 
            }
        });
    }

    _renderBlockDom(blockData, parentDomElement) {
        const blockEl = document.createElement('div');
        blockEl.id = blockData.id;
        blockEl.dataset.value = blockData.value;
        blockEl.dataset.type = blockData.type;
        blockEl.style.position = 'absolute';
        blockEl.style.left = `${blockData.x}px`;
        blockEl.style.top = `${blockData.y}px`;

        if (blockData.type === 'group') {
            blockEl.className = 'draggable group-container absolute rounded-lg border-2 border-dashed border-purple-500 bg-purple-100/50 shadow-md';
            const groupHandle = document.createElement('div');
            groupHandle.className = 'group-handle absolute top-0 left-0 w-8 h-8 bg-purple-600 rounded-tl-lg cursor-grab flex items-center justify-center text-white text-xs';
            
            // SECURITY PATCH START: Avoid innerHTML for SVG creation
            const svgNS = "http://www.w3.org/2000/svg";
            const svg = document.createElementNS(svgNS, "svg");
            svg.setAttribute("class", "h-4 w-4");
            svg.setAttribute("fill", "none");
            svg.setAttribute("viewBox", "0 0 24 24");
            svg.setAttribute("stroke", "currentColor");
            svg.setAttribute("stroke-width", "2");
            const path = document.createElementNS(svgNS, "path");
            path.setAttribute("stroke-linecap", "round");
            path.setAttribute("stroke-linejoin", "round");
            path.setAttribute("d", "M4 6h16M4 12h16M4 18h16");
            svg.appendChild(path);
            groupHandle.appendChild(svg);
            // SECURITY PATCH END: Avoid innerHTML

            blockEl.appendChild(groupHandle);
            const expressionLabel = document.createElement('div');
            expressionLabel.className = 'group-expression-label absolute bottom-1 right-2 text-purple-700 text-sm italic';
            expressionLabel.textContent = blockData.value; 
            blockEl.appendChild(expressionLabel);
            blockData.children.forEach(childId => {
                const childBlockData = this.blocks.get(childId);
                if (childBlockData) this._renderBlockDom(childBlockData, blockEl);
            });
        } else {
            blockEl.className = 'draggable bg-white rounded-lg shadow-lg p-4 text-2xl font-mono';
            // SECURITY PATCH: Use textContent instead of innerHTML
            blockEl.textContent = blockData.value;
        }

        blockEl.addEventListener('mousedown', startDrag);
        blockEl.addEventListener('touchstart', startDrag, { passive: false });
        parentDomElement.appendChild(blockEl);
        blockData.domElement = blockEl;
        return blockEl;
    }
}

const appState = new StateManager();

// SECURITY PATCH START: Debounce function for performance/DoS protection
function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}
// SECURITY PATCH END: Debounce function

document.addEventListener('DOMContentLoaded', async () => {
    const canvas = document.getElementById('canvas');
    appState.canvas = canvas;
    const statusEl = document.getElementById('status');
    const uploadButton = document.getElementById('uploadButton');
    const imageUpload = document.getElementById('imageUpload');
    const operatorSources = document.querySelectorAll('.operator-source');
    const sourceList = document.getElementById('source-list');
    const ocrNumbersList = document.getElementById('ocr-numbers');
    const operatorPalette = document.getElementById('operator-palette');
    const addNumberInput = document.getElementById('addNumberInput');
    const addNumberButton = document.getElementById('addNumberButton');

    let activeDraggable = null, offsetX, offsetY;
    let ocrWorker = null;
    const Y_TOLERANCE = 40;
    let initialMouseX, initialMouseY;
    const DRAG_THRESHOLD = 20, CONCAT_THRESHOLD = 10, HORIZONTAL_THRESHOLD = 70, OVERLAP_THRESHOLD = -100;
    let isDraggingFromSource = false, currentSourceItemValue = null, dragProxy = null, previewTargetBlock = null, dropTargetGroup = null;
    let dragStartTimer = null;
    const DRAG_START_DELAY = 150; // 150ms

    // SECURITY PATCH START: Avoid innerHTML for status updates
    function updateStatus(message, showSpinner = false) {
        statusEl.innerHTML = ''; // Clear previous content safely
        if (showSpinner) {
            const spinner = document.createElement('div');
            spinner.className = 'animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500 mr-2';
            statusEl.appendChild(spinner);
        }
        const text = document.createElement('span');
        text.textContent = message;
        statusEl.appendChild(text);
        statusEl.classList.remove('hidden');
        statusEl.classList.add('flex', 'items-center');
    }
    // SECURITY PATCH END: Avoid innerHTML for status updates

    updateStatus('OCRワーカーを初期化中...', true);
    try {
        ocrWorker = await Tesseract.createWorker('eng', 1, { logger: m => {} }); 
        await ocrWorker.load();
        await ocrWorker.loadLanguage('eng');
        await ocrWorker.initialize('eng', {
            tessedit_char_whitelist: '0123456789.'
        });
        statusEl.classList.add('hidden');
    } catch (initError) {
        console.error('Failed to initialize Tesseract worker:', initError);
        updateStatus('OCRワーカーの初期化に失敗しました。');
    }

    function sanitizeExpression(expr) {
        // SECURITY PATCH: Stricter regex to prevent malicious inputs, though eval is removed.
        return /^-?\d+(\.\d+)?([\+\-\*\/]-?\d+(\.\d+)?)*$/.test(expr.replace(/\s/g, '')) ? expr : null;
    }

    // SECURITY PATCH START: Safe expression evaluator (replaces new Function/eval)
    function safeCalculator(expression) {
        if (typeof expression !== 'string' || !sanitizeExpression(expression)) {
            return null;
        }

        const tokens = expression.match(/-?\d+(\.\d+)?|[\+\-\*\/]/g);
        if (!tokens) return null;

        const precedence = { '*': 2, '/': 2, '+': 1, '-': 1 };
        const outputQueue = [];
        const operatorStack = [];

        for (const token of tokens) {
            if (!isNaN(parseFloat(token))) {
                outputQueue.push(parseFloat(token));
            } else { // Operator
                while (
                    operatorStack.length &&
                    precedence[operatorStack[operatorStack.length - 1]] >= precedence[token]
                ) {
                    outputQueue.push(operatorStack.pop());
                }
                operatorStack.push(token);
            }
        }
        
        while (operatorStack.length) {
            outputQueue.push(operatorStack.pop());
        }

        const evaluationStack = [];
        for (const token of outputQueue) {
            if (typeof token === 'number') {
                evaluationStack.push(token);
            } else {
                const b = evaluationStack.pop();
                const a = evaluationStack.pop();
                if (a === undefined || b === undefined) return null; // Malformed expression
                switch (token) {
                    case '+': evaluationStack.push(a + b); break;
                    case '-': evaluationStack.push(a - b); break;
                    case '*': evaluationStack.push(a * b); break;
                    case '/': 
                        if (b === 0) return null; // Division by zero
                        evaluationStack.push(a / b); 
                        break;
                    default: return null; // Unknown operator
                }
            }
        }

        return evaluationStack.length === 1 ? evaluationStack[0] : null;
    }
    // SECURITY PATCH END: Safe expression evaluator

    function calculateExpressions() {
        document.querySelectorAll('.result-display').forEach(el => el.remove());
        const groupContainers = Array.from(canvas.querySelectorAll('.group-container'));
        groupContainers.forEach(groupEl => {
            const blocksInGroup = Array.from(groupEl.querySelectorAll('.draggable[data-type="number"], .draggable[data-type="operator"]')).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
            if (blocksInGroup.length < 2) return;
            let isValidArithmetic = true;
            for (let i = 0; i < blocksInGroup.length; i++) {
                const isOperator = blocksInGroup[i].dataset.type === 'operator';
                if ((i % 2 !== 0) !== isOperator) { isValidArithmetic = false; break; }
            }
            if (isValidArithmetic) {
                const expression = blocksInGroup.map(b => b.dataset.value).join('');
                const sanitized = sanitizeExpression(expression);
                if (sanitized) {
                    // SECURITY PATCH: Replace new Function with safeCalculator
                    const result = safeCalculator(sanitized);
                    if (result !== null && Number.isFinite(result)) {
                        displayResult(blocksInGroup, result, groupEl);
                    }
                }
            }
        });
    }

    // SECURITY PATCH: Debounced version of calculateExpressions
    const debouncedCalculate = debounce(calculateExpressions, 100);

    function removeContextMenu() {
        const existingMenu = document.getElementById('result-context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }
    }

    function showResultContextMenu(e, resultValue) {
        e.preventDefault();
        e.stopPropagation();
        removeContextMenu();

        const menu = document.createElement('div');
        menu.id = 'result-context-menu';
        menu.className = 'custom-context-menu';
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        menu.addEventListener('click', e => e.stopPropagation());

        const addItem = document.createElement('div');
        addItem.className = 'custom-context-menu-item';
        addItem.textContent = '数値一覧に追加';
        addItem.onclick = () => {
            createSourceNumberItem(String(resultValue));
            removeContextMenu();
        };

        menu.appendChild(addItem);
        document.body.appendChild(menu);

        setTimeout(() => {
            document.addEventListener('click', removeContextMenu, { once: true });
        }, 0);
    }

    function displayResult(line, result, groupEl = null) {
        const resultEl = document.createElement('div');
        resultEl.className = 'result-display';
        const resultValue = parseFloat(result.toFixed(4));
        
        // SECURITY PATCH: Use textContent to prevent XSS
        resultEl.textContent = `= ${resultValue}`;

        resultEl.addEventListener('contextmenu', (e) => {
            showResultContextMenu(e, resultValue);
        });

        if (groupEl) {
            const groupRect = groupEl.getBoundingClientRect();
            const canvasRect = canvas.getBoundingClientRect();
            const groupAbsRight = groupRect.left - canvasRect.left + groupEl.offsetWidth;
            const groupCenterY = groupRect.top - canvasRect.top + groupEl.offsetHeight / 2;
            resultEl.style.top = `${groupCenterY - resultEl.offsetHeight / 2}px`;
            resultEl.style.left = `${groupAbsRight + 15}px`;
            canvas.appendChild(resultEl);
        } else {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            line.forEach(block => {
                const r = block.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
                minX = Math.min(minX, r.left - cr.left);
                minY = Math.min(minY, r.top - cr.top);
                maxX = Math.max(maxX, r.right - cr.left);
                maxY = Math.max(maxY, r.bottom - cr.top);
            });
            resultEl.style.top = `${minY + (maxY - minY) / 2 - resultEl.offsetHeight / 2}px`;
            resultEl.style.left = `${maxX + 15}px`;
            canvas.appendChild(resultEl);
        }
    }

    function createBlock(text, x, y, isOperator = false, parentGroupId = null) {
        const type = isOperator ? 'operator' : 'number';
        const blockData = appState.addBlock(type, text, x, y, parentGroupId);
        if (!blockData) return null; // SECURITY PATCH: Handle block creation failure (e.g., limit reached)

        const block = document.createElement('div');
        block.id = blockData.id;
        block.className = 'draggable bg-white rounded-lg shadow-lg p-4 text-2xl font-mono';
        
        // SECURITY PATCH: Use textContent
        block.textContent = isOperator ? text.replace('*', '×').replace('/', '÷') : text;

        block.dataset.value = text;
        block.dataset.type = type;
        block.style.left = `${x}px`;
        block.style.top = `${y}px`;
        const parentEl = parentGroupId ? document.getElementById(parentGroupId) : canvas;
        parentEl.appendChild(block);
        block.addEventListener('mousedown', startDrag);
        block.addEventListener('touchstart', startDrag, { passive: false });
        blockData.domElement = block;
        appState.updateBlockPosition(blockData.id, x, y);
        return block;
    }

    function createSourceNumberItem(text) {
        // SECURITY PATCH: DoS Protection - Check total element count before adding to list
        if (appState.blocks.size >= MAX_BLOCKS) {
            console.warn(`[SECURITY] Element limit reached. Cannot add source number. Limit: ${MAX_BLOCKS}`);
            showSecurityNotification(`要素数の上限(${MAX_BLOCKS})に達しました。`);
            return;
        }

        const item = document.createElement('div');
        item.className = 'source-number-item flex items-center justify-between bg-white rounded-lg shadow-md p-2 my-1 text-2xl font-mono hover:shadow-lg transition';
        item.dataset.value = text;
        const numberSpan = document.createElement('span');
        
        // SECURITY PATCH: Use textContent
        numberSpan.textContent = text;
        
        numberSpan.className = 'flex-grow text-center cursor-text p-2';
        numberSpan.setAttribute('contenteditable', 'true');
        numberSpan.addEventListener('blur', () => {
            // SECURITY PATCH: Use textContent for reading user input
            let newValue = numberSpan.textContent.trim();
            if (!/^\d+(\.\d+)?$/.test(newValue)) {
                alert('無効な数値です。');
                numberSpan.textContent = item.dataset.value;
                return;
            }
            if (newValue !== item.dataset.value) item.dataset.value = newValue;
        });
        numberSpan.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); numberSpan.blur(); } });
        const deleteButton = document.createElement('button');
        
        // SECURITY PATCH: Use textContent
        deleteButton.textContent = 'x';
        
        deleteButton.className = 'delete-source-item ml-2 p-1 bg-red-400 text-white rounded-full h-8 w-8 flex items-center justify-center text-lg hover:bg-red-500';
        deleteButton.addEventListener('click', e => { e.stopPropagation(); item.remove(); });
        item.append(numberSpan, deleteButton);
        ocrNumbersList.appendChild(item);
        item.addEventListener('mousedown', startSourceItemDrag);
        item.addEventListener('touchstart', startSourceItemDrag, { passive: false });
    }

    function updateGroupBoundingBox(groupEl) {
        const children = Array.from(groupEl.querySelectorAll('.draggable[data-type="number"], .draggable[data-type="operator"]'));
        if (children.length === 0) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let expressionParts = [];
        children.forEach(child => {
            const x = parseFloat(child.style.left), y = parseFloat(child.style.top);
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + child.offsetWidth);
            maxY = Math.max(maxY, y + child.offsetHeight);
            expressionParts.push({ block: child, x: x });
        });
        const padding = 30;
        groupEl.style.width = `${maxX - minX + 2 * padding}px`;
        groupEl.style.height = `${maxY - minY + 2 * padding}px`;
        expressionParts.sort((a, b) => a.x - b.x);
        const expressionString = expressionParts.map(p => p.block.dataset.value).join(' ');
        const expressionLabel = groupEl.querySelector('.group-expression-label');
        // SECURITY PATCH: Use textContent
        if (expressionLabel) expressionLabel.textContent = expressionString;
        void groupEl.offsetWidth;
    }
    
    function ungroupElements(groupEl, childEl = null) {
        const childrenDomElements = Array.from(groupEl.querySelectorAll('.draggable[data-type="number"], .draggable[data-type="operator"]'));
        
        childrenDomElements.forEach(blockDom => {
            const blockData = appState.blocks.get(blockDom.id);
            if (blockData) {
                const blockRect = blockDom.getBoundingClientRect();
                const canvasRect = canvas.getBoundingClientRect();
                const newLeft = blockRect.left - canvasRect.left;
                const newTop = blockRect.top - canvasRect.top;

                blockData.parentGroupId = null;
                blockData.x = newLeft;
                blockData.y = newTop;

                blockDom.style.left = `${newLeft}px`;
                blockDom.style.top = `${newTop}px`;
                blockDom.style.position = 'absolute';
                canvas.appendChild(blockDom);
            } else {
                blockDom.remove();
            }
        });

        appState.blocks.delete(groupEl.id);
        groupEl.remove();

        void canvas.offsetWidth;
    }

    function performConcatenation(block1, block2) {
        let leftBlock = block1.offsetLeft < block2.offsetLeft ? block1 : block2;
        let rightBlock = block1 === leftBlock ? block2 : block1;
        const newValue = leftBlock.dataset.value + rightBlock.dataset.value;
        appState.removeBlock(leftBlock.id);
        appState.removeBlock(rightBlock.id);
        createBlock(newValue, leftBlock.offsetLeft, leftBlock.offsetTop);
        leftBlock.remove();
        rightBlock.remove();
    }

    function createGroup(blockIds) {
        if (appState.blocks.size >= MAX_BLOCKS) return null; // SECURITY PATCH

        const blocksToGroup = blockIds.map(id => document.getElementById(id)).filter(Boolean);
        if (blocksToGroup.length === 0) return;

        const parentGroupIds = new Set(blocksToGroup.map(b => appState.blocks.get(b.id)?.parentGroupId).filter(Boolean));
        parentGroupIds.forEach(pid => {
            const pEl = document.getElementById(pid);
            if (pEl) {
                ungroupElements(pEl);
            }
        });

        let minX_abs = Infinity, minY_abs = Infinity;
        blocksToGroup.forEach(block => {
            const x = parseFloat(block.style.left);
            const y = parseFloat(block.style.top);
            minX_abs = Math.min(minX_abs, x);
            minY_abs = Math.min(minY_abs, y);
        });

        const groupData = appState.addBlock('group', '', minX_abs, minY_abs);
        if (!groupData) return null; // SECURITY PATCH
        const groupEl = document.createElement('div');
        groupEl.id = groupData.id;
        groupEl.dataset.type = 'group';
        groupEl.className = 'draggable group-container absolute rounded-lg border-2 border-dashed border-purple-500 bg-purple-100/50 shadow-md';
        groupData.domElement = groupEl;
        groupEl.style.left = `${minX_abs}px`;
        groupEl.style.top = `${minY_abs}px`;
        
        const groupHandle = document.createElement('div');
        groupHandle.className = 'group-handle absolute top-0 left-0 w-8 h-8 bg-purple-600 rounded-tl-lg cursor-grab';
        
        // SECURITY PATCH START: Avoid innerHTML
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("class", "h-4 w-4 text-white mx-auto my-2");
        svg.setAttribute("fill", "none");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "2");
        const path = document.createElementNS(svgNS, "path");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        path.setAttribute("d", "M4 6h16M4 12h16M4 18h16");
        svg.appendChild(path);
        groupHandle.appendChild(svg);
        // SECURITY PATCH END: Avoid innerHTML

        groupEl.appendChild(groupHandle);
        const expressionLabel = document.createElement('div');
        expressionLabel.className = 'group-expression-label absolute bottom-1 right-2 text-purple-700 text-sm italic';
        groupEl.appendChild(expressionLabel);

        blocksToGroup.forEach(block => {
            const blockData = appState.blocks.get(block.id);
            if (blockData) {
                const oldAbsLeft = parseFloat(block.style.left);
                const oldAbsTop = parseFloat(block.style.top);
                const newRelLeft = oldAbsLeft - minX_abs;
                const newRelTop = oldAbsTop - minY_abs;

                blockData.parentGroupId = groupData.id;
                blockData.x = newRelLeft;
                blockData.y = newRelTop;
                groupData.children.push(block.id);

                block.style.left = `${newRelLeft}px`;
                block.style.top = `${newRelTop}px`;
                groupEl.appendChild(block);
            } else {
                block.remove();
            }
        });
        
        canvas.appendChild(groupEl);
        groupEl.addEventListener('mousedown', startDrag);
        groupEl.addEventListener('touchstart', startDrag, { passive: false });

        realignGroupElements(groupEl);
        
        return groupEl;
    }

    function findCalculableLine(blocks) {
        const blockValues = blocks.map(b => b.dataset.value);
        if (blocks.length < 3) return null;

        const firstBlockY = blocks[0].getBoundingClientRect().top;
        if (blocks.some(b => Math.abs(b.getBoundingClientRect().top - firstBlockY) > Y_TOLERANCE)) {
            return null;
        }
        if (blocks[0].dataset.type !== 'number' || blocks[blocks.length - 1].dataset.type !== 'number') {
            return null;
        }
        for (let i = 1; i < blocks.length; i++) {
            if (blocks[i].dataset.type === blocks[i-1].dataset.type) return null;
        }
        for (let i = 0; i < blocks.length - 1; i++) {
            const dist = blocks[i+1].getBoundingClientRect().left - blocks[i].getBoundingClientRect().right;
            if (dist < OVERLAP_THRESHOLD || dist > HORIZONTAL_THRESHOLD) return null;
        }
        return blocks.map(b => b.id);
    }

    function checkAndAutoGroup(draggedBlock) {
        let allBlocks = Array.from(canvas.querySelectorAll(':scope > .draggable:not(.group-container)'));
        let processedBlockIds = new Set();
        for (const block of allBlocks) {
            if (processedBlockIds.has(block.id)) continue;
            const yCenter = block.getBoundingClientRect().top + block.offsetHeight / 2;
            const potentialLine = allBlocks.filter(b => 
                !processedBlockIds.has(b.id) && 
                Math.abs(b.getBoundingClientRect().top + b.offsetHeight / 2 - yCenter) <= Y_TOLERANCE
            );
            if (potentialLine.length < 3) {
                potentialLine.forEach(b => processedBlockIds.add(b.id));
                continue;
            }
            potentialLine.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
            for (let len = potentialLine.length; len >= 3; len--) {
                for (let i = 0; i <= potentialLine.length - len; i++) {
                    const subLine = potentialLine.slice(i, i + len);
                    const calculableBlockIds = findCalculableLine(subLine);
                    if (calculableBlockIds) {
                        createGroup(calculableBlockIds);
                        return;
                    }
                }
            }
            potentialLine.forEach(b => processedBlockIds.add(b.id));
        }
    }

    function isNearAnyGroup(block) {
        const NEAR_THRESHOLD = 50;
        const blockRect = block.getBoundingClientRect();
        for (const group of canvas.querySelectorAll('.group-container')) {
            const groupRect = group.getBoundingClientRect();
            if ((blockRect.right + NEAR_THRESHOLD) > groupRect.left && (blockRect.left - NEAR_THRESHOLD) < groupRect.right &&
                (blockRect.bottom + NEAR_THRESHOLD) > groupRect.top && (blockRect.top - NEAR_THRESHOLD) < groupRect.bottom) {
                return true;
            }
        }
        return false;
    }

    function realignGroupElements(groupEl) {
        const groupData = appState.blocks.get(groupEl.id);
        if (!groupData) return;
        const children = groupData.children.map(id => document.getElementById(id)).filter(Boolean);
        if (children.length === 0) {
            updateGroupBoundingBox(groupEl);
            return;
        }

        children.sort((a, b) => {
            const blockA_data = appState.blocks.get(a.id);
            const blockB_data = appState.blocks.get(b.id);
            if (!blockA_data || !blockB_data) return 0;
            return blockA_data.x - blockB_data.x;
        });
        
        const padding = 30;
        let maxHeight = Math.max(...children.map(c => c.offsetHeight));
        let currentXOffset = padding;
        
        children.forEach(child => {
            const childData = appState.blocks.get(child.id);
            const newRelativeLeft = currentXOffset;
            const newRelativeTop = padding + (maxHeight / 2) - (child.offsetHeight / 2);

            child.style.left = `${newRelativeLeft}px`;
            child.style.top = `${newRelativeTop}px`;
            if (childData) {
                childData.x = newRelativeLeft;
                childData.y = newRelativeTop;
            }
            currentXOffset += child.offsetWidth + padding;
        });
        
        updateGroupBoundingBox(groupEl);
    }

    function removeBlockFromGroup(block, group) {
        const blockData = appState.blocks.get(block.id);
        const groupData = appState.blocks.get(group.id);
        if (!blockData || !groupData || blockData.parentGroupId !== group.id) return;
        groupData.children = groupData.children.filter(id => id !== block.id);
        blockData.parentGroupId = null;
        const blockRect = block.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const newLeft = blockRect.left - canvasRect.left;
        const newTop = blockRect.top - canvasRect.top;
        block.style.left = `${newLeft}px`;
        block.style.top = `${newTop}px`;
        block.style.position = 'absolute';
        canvas.appendChild(block);
        blockData.x = newLeft;
        blockData.y = newTop;
        block.originalParentGroup = null; 
        if (groupData.children.length > 0) {
            validateAndRegroupIfNecessary(group);
        } else {
            appState.blocks.delete(group.id);
            group.remove();
        }
    }

    function validateAndRegroupIfNecessary(group) {
        const groupData = appState.blocks.get(group.id);
        if (!groupData) return;
        if (groupData.children.length < 2) {
            ungroupElements(group);
            return;
        }
        let children = groupData.children.map(id => document.getElementById(id)).filter(Boolean);
        children.sort((a, b) => parseFloat(a.style.left) - parseFloat(b.style.left));
        let isValidPattern = true;
        for (let i = 1; i < children.length; i++) {
            if (children[i].dataset.type === children[i-1].dataset.type) {
                isValidPattern = false;
                break;
            }
        }
        if (isValidPattern) {
            realignGroupElements(group);
            return;
        }
        let longestValidChain = [];
        if (children.length > 0 && children[0].dataset.type === 'number') {
            longestValidChain.push(children[0]);
            for (let i = 1; i < children.length; i++) {
                if (children[i].dataset.type !== children[i-1].dataset.type) {
                    longestValidChain.push(children[i]);
                } else {
                    break;
                }
            }
        }
        ungroupElements(group);
        if (longestValidChain.length >= 2) {
            createGroup(longestValidChain.map(b => b.id));
        }
    }

    function addBlockToGroup(block, groupEl) {
        const blockData = appState.blocks.get(block.id);
        const groupData = appState.blocks.get(groupEl.id);
        if (!blockData || !groupData || block.id === groupEl.id) return false;
        const children = groupData.children.map(id => document.getElementById(id)).filter(Boolean);
        const newSequence = [...children, block];
        newSequence.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
        let isValid = true;
        for (let i = 1; i < newSequence.length; i++) {
            if (newSequence[i].dataset.type === newSequence[i-1].dataset.type) {
                isValid = false;
                break;
            }
        }
        if (!isValid) return false;
        if (blockData.parentGroupId && blockData.parentGroupId !== groupEl.id) {
            const oldParent = appState.blocks.get(blockData.parentGroupId);
            if (oldParent) {
                oldParent.children = oldParent.children.filter(id => id !== block.id);
                const oldParentEl = document.getElementById(oldParent.id);
                if (oldParentEl) updateGroupBoundingBox(oldParentEl);
            }
        }
        if (!groupData.children.includes(block.id)) groupData.children.push(block.id);
        blockData.parentGroupId = groupEl.id;
        const groupRect = groupEl.getBoundingClientRect(), blockRect = block.getBoundingClientRect();
        const newLeft = blockRect.left - groupRect.left, newTop = blockRect.top - groupRect.top;
        block.style.left = `${newLeft}px`;
        block.style.top = `${newTop}px`;
        groupEl.appendChild(block);
        blockData.x = newLeft;
        blockData.y = newTop;
        realignGroupElements(groupEl);
        return true;
    }

    function drag(e) {
        if (!activeDraggable) return;
        e.preventDefault();
        const event = e.touches ? e.touches[0] : e;
        if (previewTargetBlock) previewTargetBlock.classList.remove('ring-2', 'ring-blue-500');
        if (dropTargetGroup) dropTargetGroup.classList.remove('group-drop-target');
        previewTargetBlock = dropTargetGroup = null;
        activeDraggable.classList.remove('ring-2', 'ring-blue-500');
        let parentRect = (activeDraggable === dragProxy) ? document.body.getBoundingClientRect() : canvas.getBoundingClientRect();
        activeDraggable.style.left = `${event.clientX - offsetX - parentRect.left}px`;
        activeDraggable.style.top = `${event.clientY - offsetY - parentRect.top}px`;
        const activeRect = activeDraggable.getBoundingClientRect();
        if (activeDraggable.dataset.type !== 'group' && activeDraggable !== dragProxy) {
            for (const group of canvas.querySelectorAll('.group-container')) {
                const groupRect = group.getBoundingClientRect();
                if (!(activeRect.right < groupRect.left || activeRect.left > groupRect.right || activeRect.bottom < groupRect.top || activeRect.top > groupRect.bottom)) {
                    dropTargetGroup = group;
                    group.classList.add('group-drop-target');
                    break;
                }
            }
        }
        if (!dropTargetGroup && activeDraggable.dataset.type === 'number' && activeDraggable !== dragProxy) {
            for (const block of canvas.querySelectorAll('.draggable')) {
                if (block === activeDraggable || block.dataset.type !== 'number') continue;
                const blockRect = block.getBoundingClientRect();
                if (!(activeRect.right < blockRect.left - CONCAT_THRESHOLD || activeRect.left > blockRect.right + CONCAT_THRESHOLD || activeRect.bottom < blockRect.top - CONCAT_THRESHOLD || activeRect.top > blockRect.bottom + CONCAT_THRESHOLD)) {
                    previewTargetBlock = block;
                    activeDraggable.classList.add('ring-2', 'ring-blue-500');
                    previewTargetBlock.classList.add('ring-2', 'ring-blue-500');
                    break;
                }
            }
        }
        if (activeDraggable.originalParentGroup) {
            const parentGroup = activeDraggable.originalParentGroup;
            const UNGROUP_THRESHOLD = 30;
            const pRect = parentGroup.getBoundingClientRect();
            if (activeRect.left < pRect.left - UNGROUP_THRESHOLD || activeRect.right > pRect.right + UNGROUP_THRESHOLD || activeRect.top < pRect.top - UNGROUP_THRESHOLD || activeRect.bottom > pRect.bottom + UNGROUP_THRESHOLD) {
                removeBlockFromGroup(activeDraggable, parentGroup);
            }
        }
        // SECURITY PATCH: Use debounced calculation on drag
        debouncedCalculate();
    }
    
    function stopDrag() {
        if (!activeDraggable) return;

        if (previewTargetBlock) previewTargetBlock.classList.remove('ring-2', 'ring-blue-500');
        if (dropTargetGroup) dropTargetGroup.classList.remove('group-drop-target');
        activeDraggable.classList.remove('dragging', 'ring-2', 'ring-blue-500');
        const isProxyDrag = activeDraggable === dragProxy;
        let droppedInGroup = false;

        if (dropTargetGroup && !isProxyDrag) {
            const addedSuccessfully = addBlockToGroup(activeDraggable, dropTargetGroup);
            if (addedSuccessfully) {
                droppedInGroup = true;
            } else {
                appState.updateBlockPosition(activeDraggable.id, parseFloat(activeDraggable.style.left), parseFloat(activeDraggable.style.top));
                if (!isNearAnyGroup(activeDraggable)) checkAndAutoGroup(activeDraggable);
            }
        } else if (previewTargetBlock) {
            performConcatenation(activeDraggable, previewTargetBlock);
        } else if (activeDraggable.originalParentGroup) {
            realignGroupElements(activeDraggable.originalParentGroup);
        } else {
            const r = activeDraggable.getBoundingClientRect(), sr = sourceList.getBoundingClientRect(), pr = operatorPalette.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
            const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            const inSource = cx > sr.left && cx < sr.right && cy > sr.top && cy < sr.bottom;
            const inPalette = cx > pr.left && cx < pr.right && cy > pr.top && cy < pr.bottom;

            if (isProxyDrag) {
                if (!inSource && !inPalette) {
                    const newBlock = createBlock(currentSourceItemValue, cx - cr.left - (r.width / 2), cy - cr.top - (r.height / 2));
                    if (newBlock && !isNearAnyGroup(newBlock)) checkAndAutoGroup(newBlock);
                }
            } else if (inSource || inPalette) {
                const removedFromState = appState.removeBlock(activeDraggable.id);
                if(removedFromState) activeDraggable.remove();
            } else if (!droppedInGroup) {
                appState.updateBlockPosition(activeDraggable.id, parseFloat(activeDraggable.style.left), parseFloat(activeDraggable.style.top));
                if (!isNearAnyGroup(activeDraggable)) {
                    checkAndAutoGroup(activeDraggable);
                }
            }
        }

        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', stopDrag);
        document.removeEventListener('touchmove', drag);
        document.removeEventListener('touchend', stopDrag);
        
        // SECURITY PATCH: Use final debounced calculation on drag stop
        debouncedCalculate();

        if (isProxyDrag) activeDraggable.remove();

        activeDraggable = previewTargetBlock = dropTargetGroup = currentSourceItemValue = dragProxy = null;
        isDraggingFromSource = false;
        document.body.style.userSelect = 'auto';
    }

    function startSourceItemDrag(e) {
        e.preventDefault();
        isDraggingFromSource = true;
        currentSourceItemValue = e.target.closest('.source-number-item')?.dataset.value;
        if (!currentSourceItemValue) return;
        initialMouseX = e.clientX; 
        initialMouseY = e.clientY;
        const originalTarget = e.target;
        
        const onMouseMove = (moveEvent) => {
            if (Math.abs(moveEvent.clientX - initialMouseX) > 5 || Math.abs(moveEvent.clientY - initialMouseY) > 5) {
                clearTimeout(dragStartTimer);
                cleanupListeners();
                startDragProxy(moveEvent, originalTarget);
            }
        };

        const onMouseUp = () => {
            clearTimeout(dragStartTimer);
            cleanupListeners();
            const numberSpan = originalTarget.closest('.flex-grow');
            if(numberSpan) {
                numberSpan.focus();
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(numberSpan);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        };
        
        const cleanupListeners = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.removeEventListener('touchmove', onMouseMove);
            document.removeEventListener('touchend', onMouseUp);
        };

        dragStartTimer = setTimeout(() => {
            cleanupListeners();
            startDragProxy(e, originalTarget);
        }, DRAG_START_DELAY);

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp, { once: true });
        document.addEventListener('touchmove', onMouseMove, { passive: false });
        document.addEventListener('touchend', onMouseUp, { once: true });
    }

    function startDragProxy(e, originalTarget) {
        document.body.style.userSelect = 'none';
        dragProxy = document.createElement('div');
        dragProxy.className = 'draggable bg-white rounded-lg shadow-lg p-4 text-2xl font-mono';
        dragProxy.textContent = currentSourceItemValue;
        dragProxy.dataset.value = currentSourceItemValue;
        dragProxy.dataset.type = 'number';
        dragProxy.style.cssText = 'position:absolute; pointer-events:none; z-index:9999;';
        const temp = document.body.appendChild(dragProxy.cloneNode(true));
        temp.style.visibility = 'hidden';
        offsetX = temp.offsetWidth / 2; 
        offsetY = temp.offsetHeight / 2;
        temp.remove();
        const coords = e.touches ? e.touches[0] : e;
        dragProxy.style.left = `${coords.clientX - offsetX}px`;
        dragProxy.style.top = `${coords.clientY - offsetY}px`;
        document.body.appendChild(dragProxy);
        activeDraggable = dragProxy;
        activeDraggable.classList.add('dragging');
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDrag, { once: true });
        document.addEventListener('touchmove', drag, { passive: false });
        document.addEventListener('touchend', stopDrag, { once: true });
    }

    function startDrag(e) {
        e.preventDefault();
        const draggable = e.target.closest('.draggable');
        if (!draggable) return;
        activeDraggable = draggable;
        if (e.target.classList.contains('group-handle')) activeDraggable = draggable.closest('.group-container');
        const parentGroup = draggable.closest('.group-container');
        if (parentGroup && activeDraggable !== parentGroup) activeDraggable.originalParentGroup = parentGroup;
        activeDraggable.classList.add('dragging');
        const event = e.touches ? e.touches[0] : e;
        const rect = activeDraggable.getBoundingClientRect();
        offsetX = event.clientX - rect.left;
        offsetY = event.clientY - rect.top;
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDrag, { once: true });
        document.addEventListener('touchmove', drag, { passive: false });
        document.addEventListener('touchend', stopDrag, { once: true });
    }

    function getOtsuThreshold(pixelData) {
        const histogram = new Array(256).fill(0);
        let totalPixels = 0;
        for (let i = 0; i < pixelData.length; i += 4) {
            histogram[pixelData[i]]++;
            totalPixels++;
        }
        let sum = 0;
        for (let i = 0; i < 256; i++) sum += i * histogram[i];
        let sumB = 0, wB = 0, wF = 0, maxVariance = 0, threshold = 0;
        for (let t = 0; t < 256; t++) {
            wB += histogram[t];
            if (wB === 0) continue;
            wF = totalPixels - wB;
            if (wF === 0) break;
            sumB += t * histogram[t];
            const mB = sumB / wB;
            const mF = (sum - sumB) / wF;
            const variance = wB * wF * Math.pow(mB - mF, 2);
            if (variance > maxVariance) {
                maxVariance = variance;
                threshold = t;
            }
        }
        return threshold;
    }

    // SECURITY PATCH START: OCR DoS Protection (Size Limit & Concurrency)
    let isOcrProcessing = false;
    const MAX_IMAGE_SIZE_MB = 5;
    const MAX_IMAGE_DIMENSION = 4000;
    // SECURITY PATCH END: OCR DoS Protection

    async function processImage(file) {
        // SECURITY PATCH START: OCR DoS Protection checks
        if (isOcrProcessing) {
            console.warn('[SECURITY] OCR process is already running.');
            showSecurityNotification('現在、別の画像を処理中です。');
            return;
        }
        if (!file || !ocrWorker) return;

        if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
            console.warn(`[SECURITY] Image file size exceeds limit. Size: ${file.size}, Limit: ${MAX_IMAGE_SIZE_MB}MB`);
            showSecurityNotification(`画像サイズが大きすぎます (${MAX_IMAGE_SIZE_MB}以下)。`);
            return;
        }
        isOcrProcessing = true;
        // SECURITY PATCH END: OCR DoS Protection checks
        
        updateStatus('前処理と解析を実行中...', true);

        try {
            const imageUrl = URL.createObjectURL(file);
            const image = new Image();
            image.src = imageUrl;

            image.onload = async () => {
                try {
                    // SECURITY PATCH START: OCR DoS - Image dimension check
                    if (image.width > MAX_IMAGE_DIMENSION || image.height > MAX_IMAGE_DIMENSION) {
                        console.warn(`[SECURITY] Image dimensions exceed limit. Dimensions: ${image.width}x${image.height}, Limit: ${MAX_IMAGE_DIMENSION}px`);
                        showSecurityNotification(`画像の解像度が高すぎます (${MAX_IMAGE_DIMENSION}px以下)。`);
                        throw new Error("Image dimensions too large.");
                    }
                    // SECURITY PATCH END: OCR DoS - Image dimension check

                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const TARGET_HEIGHT = 1000;
                    const aspectRatio = image.width / image.height;
                    canvas.width = TARGET_HEIGHT * aspectRatio;
                    canvas.height = TARGET_HEIGHT;
                    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imageData.data;
                    for (let i = 0; i < data.length; i += 4) {
                        const avg = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
                        data[i] = data[i+1] = data[i+2] = avg;
                    }
                    const threshold = getOtsuThreshold(data);
                    for (let i = 0; i < data.length; i += 4) {
                        const color = data[i] > threshold ? 255 : 0;
                        data[i] = data[i+1] = data[i+2] = color;
                    }
                    ctx.putImageData(imageData, 0, 0);

                    const { data: { words } } = await ocrWorker.recognize(canvas);
                    const processedWords = words.map(w => ({
                        text: w.text.replace(/[^0-9.]/g, ''),
                        confidence: w.confidence
                    }));
                    const detectedNumbers = processedWords.filter(p => p.text && p.confidence > 30);
                    detectedNumbers.forEach(p => createSourceNumberItem(p.text));
                    updateStatus(detectedNumbers.length > 0 ? `${detectedNumbers.length}個の数字を検出。` : '数字が検出されませんでした。');

                } catch (ocrError) {
                    console.error('OCR Error:', ocrError);
                    updateStatus('解析エラー。');
                } finally {
                    URL.revokeObjectURL(imageUrl);
                    setTimeout(() => statusEl.classList.add('hidden'), 3000);
                    isOcrProcessing = false; // SECURITY PATCH
                }
            };
            image.onerror = () => {
                updateStatus('画像の読み込みに失敗しました。');
                setTimeout(() => statusEl.classList.add('hidden'), 3000);
                isOcrProcessing = false; // SECURITY PATCH
            };
        } catch (error) {
            console.error('Image processing setup error:', error);
            updateStatus('画像処理の準備中にエラーが発生しました。');
            setTimeout(() => statusEl.classList.add('hidden'), 3000);
            isOcrProcessing = false; // SECURITY PATCH
        }
    }
    
    function handlePaste(e) {
        const file = e.clipboardData.files[0];
        if (file && file.type.startsWith('image/')) {
            processImage(file);
            e.preventDefault();
        }
    }

    uploadButton.addEventListener('click', () => imageUpload.click());
    imageUpload.addEventListener('change', (e) => e.target.files[0] && processImage(e.target.files[0]));
    window.addEventListener('paste', handlePaste);
    operatorSources.forEach(source => {
        source.addEventListener('mousedown', e => {
            e.preventDefault();
            const rect = source.getBoundingClientRect(), canvasRect = canvas.getBoundingClientRect();
            const newBlock = createBlock(source.dataset.value, rect.left - canvasRect.left, rect.top - canvasRect.top, true);
            if (newBlock) { // SECURITY PATCH: check if block was created
                newBlock.dispatchEvent(new MouseEvent('mousedown', { clientX: e.clientX, clientY: e.clientY, bubbles: true }));
            }
        });
    });
    addNumberButton.addEventListener('click', () => {
        const val = addNumberInput.value.trim();
        if (val && /^\d+(\.\d+)?$/.test(val)) {
            createSourceNumberItem(val);
            addNumberInput.value = '';
        } else {
            alert('無効な数値です。');
        }
    });

});

})();
