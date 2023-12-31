const LINE_COUNT = 31;
const TRAINING_CORE_REQUIRED_LIFESPAN = 30;

let ready = false;

let requestedSpeed = 2;

const TUTORIALIZED_OPS = [
    module.exports.OPERATIONS.WRITE,
    module.exports.OPERATIONS.ADD,
    module.exports.OPERATIONS.COPY,
    module.exports.OPERATIONS.MOVE,
    module.exports.OPERATIONS.SKIP_IF_EQUAL,
    module.exports.OPERATIONS.JUMP,
    module.exports.OPERATIONS.DATA
];

const SKIP_LINKS = {};
SKIP_LINKS[module.exports.OPERATIONS.SKIP_IF_EQUAL] = module.exports.EQUAL_LINKS[0];
SKIP_LINKS[module.exports.OPERATIONS.SKIP_IF_GREATER] = module.exports.GREATER_LINKS[0];
SKIP_LINKS[module.exports.OPERATIONS.SKIP_IF_LOWER] = module.exports.LOWER_LINKS[0];

const SKIP_VERBS = {};
SKIP_VERBS[module.exports.OPERATIONS.SKIP_IF_EQUAL] = "equals";
SKIP_VERBS[module.exports.OPERATIONS.SKIP_IF_GREATER] = "is greater than";
SKIP_VERBS[module.exports.OPERATIONS.SKIP_IF_LOWER] = "is lower than";

// parse results
const targetedLines = [];

const codeLineIndices = {};
const trimmedLines = {};

// buttons
const editorButtons = {};

// training core
const trainingCoreCells = [];
let lastTrainingBuffer;
let lastTrainingFlagsBuffer;
let trainingCoreIsRunning = false;
let trainedForCycles = 0;

let programIsEmpty = true;

interactive.inputs = [];
interactive.inputDisplays = [];
interactive.programNameInput = null;

interactive.enableInteractiveHelp = true;
interactive.enableResponsiveButtons = true;
interactive.interactiveTextDiv = null;
interactive.editorContainer = null;
interactive.coreContainer = null;
interactive.explanationsWindow = null;

interactive.onWindowLoad = function () {
    interactive.createEditor();
    interactive.bindButtons();
    interactive.createTrainingCoreDisplay(3, 32);

    interactive.explanationsWindow = document.getElementById("explanations-window");
    interactive.interactiveTextDiv = document.getElementById("explanations");
    interactive.editorContainer = document.getElementById("editor-container");
    interactive.coreContainer = document.getElementById("core-container");
    interactive.container = document.getElementById("code-editor");

    ready = true;

    // Select first
    interactive.programNameInput.value = "MY_DELEGATE";

    // fetch("server/test_program.kcp")
    //     .then((res) => res.text())
    //     .then((text) => {z
    //         // do something with "text"
    //         // loadProgram(text);
    //     })
    //     .catch((e) => console.error(e));

    interactive.initializeSocket();
    interactive.ready = true;

    if (globalCore.ready && interactive.ready && !serverCom.connected) {
        serverCom.connected = true;
        socket.connect();
    }
}

interactive.show = function () {
    if (ready) {
        interactive.container.style = {};
        document.getElementById("global-core").style.display = "none";
        document.getElementById("credits").style.display = "none";

        if (!tutorial.shouldPlayTutorial) {
            interactive.inputs[0].focus();
            interactive.refreshLine(0);
        }
    }
}

interactive.loadProgram = function (name, str) {
    if (!ready) {
        return;
    }

    interactive.programNameInput.value = name;

    const lines = str.split('\n');
    for (let i = 0; i < LINE_COUNT; i++) {
        const input = document.getElementById(`input-${i}`);
        input.value = lines[i] ? lines[i] : "";
        interactive.refreshSyntaxDetectionOnLine(i);
    }

    if (!tutorial.shouldPlayTutorial) {
        interactive.inputs[0].focus();
        interactive.refreshButtons();
    }
}

interactive.createTrainingCoreDisplay = function (columns, size) {
    if (trainingCoreCells.length != columns * size) {
        trainingCoreCells.length = 0;
        const parent = document.getElementById("core-training");
        parent.innerHTML = "";

        const height = size;
        trainingCoreCells.length = 0;

        for (let x = 0; x < columns; x++) {

            const row = document.createElement("div");
            row.className = "row";
            for (let y = 0; y < height; y++) {

                const memoryAddress =
                    x * height
                    + y;

                const cell = document.createElement("div");
                cell.className = "cell";

                if (x == Math.floor(columns / 2)) {
                    if (y == Math.floor(height / 2)) {
                        cell.textContent = "[ ASMBLY ]"
                    }
                    else if (y == Math.floor(height / 2) + 1) {
                        cell.textContent = "[ \u00a0IDLE\u00a0 ]"
                    }
                }


                if (cell.textContent.length == 0) {
                    cell.className += " idle";
                    cell.textContent = "--------";
                }

                trainingCoreCells[memoryAddress] = cell;

                row.appendChild(cell);
            }

            parent.appendChild(row);
        }
    }
}

interactive.updateTrainingCoreDisplayFromFullBuffer = function (obj) {
    lastTrainingBuffer = obj.data;//Int32Array
    lastTrainingFlagsBuffer = obj.flags;

    if (lastTrainingBuffer.length != trainingCoreCells.length) {
        console.log("Unexpected buffer length, got %d instea of %d", buff.length, trainingCoreCells.length);
    }

    interactive.updateTrainingCoreDisplay(obj.nextAddress);
}

interactive.updateTrainingCoreDisplayFromDelta = function (obj) {
    if (lastTrainingBuffer) {
        for (let k in obj.delta) {
            lastTrainingBuffer[k] = obj.delta[k];
        }
    }

    if (lastTrainingFlagsBuffer) {
        for (let k in obj.deltaFlags) {
            lastTrainingFlagsBuffer[k] = obj.deltaFlags[k];
        }
    }

    interactive.updateTrainingCoreDisplay(obj.nextAddress);
}

interactive.updateTrainingCoreDisplay = function (nextAddress) {
    const lineLength = 8;

    const buff = lastTrainingBuffer;
    const flags = lastTrainingFlagsBuffer;

    for (let i = 0; i < buff.length; i++) {
        let txt = "--------";
        const value = buff[i];
        const op = (value >> module.exports.OPERATION_SHIFT) & module.exports.OPERATION_MASK;

        if (op > 0) {
            const operation = Object.keys(module.exports.OPERATIONS)[op];
            if (op == module.exports.OPERATIONS.NOOP) {
                txt = "--------";
            }
            else if (operation) {
                txt = operation.toUpperCase().substring(0, lineLength).padEnd(lineLength);
            }
            else {
                if (value > 0) {
                    txt = `${value.toString().padStart(lineLength, '0')}`;
                }
                else {
                    txt = `-${Math.abs(value).toString().padStart(lineLength - 1, '0')}`;
                }
            }
        }
        else {
            txt = `${value.toString().padStart(lineLength, '0')}`;

            if (value == 0) {
                trainingCoreCells[i].style.color = "gray";
            }
            else {
                trainingCoreCells[i].style.color = "white";
            }
        }

        const owner = flags[i];
        trainingCoreCells[i].textContent = txt;

        trainingCoreCells[i].style.backgroundColor = owner == 0 ? "" : "darkred";
        trainingCoreCells[i].style.backgroundColor = nextAddress == i ? "orange" : trainingCoreCells[i].style.backgroundColor;
    }
}

interactive.testProgram = function () {
    if (socket) {
        trainedForCycles = 0;
        socket.emit("testProgram", interactive.programNameInput.value, interactive.getProgramString(), 1);
    }
}

interactive.bindButtons = function () {

    const dismissButton = document.getElementById("splash-dismiss");
    dismissButton.onclick = function () {
        if (ready) {
            document.getElementById("intro").style.display = "none";
            document.getElementById("global-core").style = {};
        }
    };

    editorButtons.trainingButton = document.getElementById("run-training-program");
    editorButtons.trainingButton.onclick = function () {
        interactive.testProgram();
    };

    editorButtons.killTestCoreButton = document.getElementById("kill-test-core");
    editorButtons.killTestCoreButton.onclick = function () {
        if (socket) {
            socket.emit("stopTestingProgram");
            trainingCoreIsRunning = false;

            interactive.clearTrainingBuffer();
            interactive.refreshButtons();
        }
    };

    editorButtons.speedUpButton = document.getElementById("speed-up");
    editorButtons.speedUpButton.onclick = function () {
        if (socket) {
            requestedSpeed = Math.max(0, Math.min(++requestedSpeed, 5));
            socket.emit("setSpeed", requestedSpeed);
        }
    };

    editorButtons.speedDownButton = document.getElementById("speed-down");
    editorButtons.speedDownButton.onclick = function () {
        if (socket) {
            requestedSpeed = Math.max(0, Math.min(--requestedSpeed, 5));
            socket.emit("setSpeed", requestedSpeed);
        }
    };

    editorButtons.loadSamplesButton = document.getElementById("load-sample");
    editorButtons.loadSamplesButton.onclick = function () {
        if (ready && programIsEmpty) {
            // Load sample
            let progName = module.exports.samplePrograms[Math.floor(Math.random() * module.exports.samplePrograms.length)];

            if (NEW_PLAYER) {
                NEW_PLAYER = false;
                progName = module.exports.samplePrograms[0];
            }

            fetch(`res/support/${progName}.SRC`)
                .then((res) => res.text())
                .then((text) => {
                    interactive.loadProgram(progName, text);
                })
                .catch((e) => console.error(e));

        }
    };

    editorButtons.saveButton = document.getElementById("save-program");
    editorButtons.saveButton.onclick = function () {
        if (ready && !programIsEmpty) {
            interactive.download(
                interactive.getProgramString(),
                `${interactive.programNameInput.value.trim().toUpperCase()}.SRC`,
                'text/killcore-program');
        }
    };

    editorButtons.clearButton = document.getElementById("clear-program");
    editorButtons.clearButton.onclick = function () {
        if (ready && !programIsEmpty) {
            for (let i = 0; i < LINE_COUNT; i++) {
                interactive.inputs[i].value = "";
                interactive.refreshLine(i);
            }

            const input = interactive.inputs[0];
            input.setSelectionRange(0, 0);
            input.focus();

            interactive.refreshButtons();
        }
    };

    editorButtons.loadButton = document.getElementById("load-program");
    editorButtons.loadButton.onclick = function () {
        if (ready) {
            interactive.upload();
        }
    };

    editorButtons.sendToGlobalCoreButton = document.getElementById("send-to-core");
    editorButtons.sendToGlobalCoreButton.onclick = function () {
        interactive.sendToCore();
    };

    editorButtons.accessCoreButton = document.getElementById("access-core");
    editorButtons.accessCoreButton.onclick = function () {
        if (ready) {
            globalCore.show();
        }
    };

    interactive.refreshButtons();
}

interactive.sendToCore = function () {
    if (ready) {
        socket.emit("uploadProgram", interactive.programNameInput.value, interactive.getProgramString());

        trainedForCycles = 0;
        interactive.refreshButtons();
    }
}

interactive.refreshEditorButtons = function () {
    if (!interactive.enableResponsiveButtons) {
        return;
    }

    editorButtons.saveButton.disabled = programIsEmpty;
    editorButtons.trainingButton.disabled = trainingCoreIsRunning || programIsEmpty;
    editorButtons.clearButton.disabled = programIsEmpty;

    editorButtons.loadSamplesButton.style.display = programIsEmpty ? "block" : "none";
    editorButtons.saveButton.style.display = !programIsEmpty ? "block" : "none";
    editorButtons.clearButton.style.display = !programIsEmpty ? "block" : "none";
}

interactive.refreshTrainingCoreButtons = function () {
    editorButtons.killTestCoreButton.disabled = !trainingCoreIsRunning;
    editorButtons.speedUpButton.disabled = !trainingCoreIsRunning;
    editorButtons.speedDownButton.disabled = !trainingCoreIsRunning;
    editorButtons.sendToGlobalCoreButton.disabled = trainedForCycles < TRAINING_CORE_REQUIRED_LIFESPAN;
    editorButtons.trainingButton.disabled = trainingCoreIsRunning || programIsEmpty;
    editorButtons.sendToGlobalCoreButton.textContent = "SEND TO ASSEMBLY >>";

    // Update send to core button
    if (trainingCoreIsRunning) {
        if (trainedForCycles < TRAINING_CORE_REQUIRED_LIFESPAN) {
            const remaining = TRAINING_CORE_REQUIRED_LIFESPAN - trainedForCycles;
            editorButtons.sendToGlobalCoreButton.textContent = `${remaining} cycles before approval`;
        }
    }
    else {
    }

}

interactive.refreshButtons = function () {
    interactive.refreshProgramIsEmpty();
    interactive.refreshTrainingCoreButtons();
    interactive.refreshEditorButtons();
}

interactive.refreshProgramIsEmpty = function () {
    programIsEmpty = true;
    for (let i = 0; i < LINE_COUNT; i++) {
        if (interactive.inputs[i].value.trim().length > 0) {
            programIsEmpty = false;
            break;
        }
    }
}

interactive.getProgramString = function () {
    let program = "";
    for (let i = 0; i < LINE_COUNT; i++) {
        const input = interactive.inputs[i];
        program += input.value.substring(0, 128) + "\n"; // Limit to 128 characters
    }

    return program;
}

interactive.createEditor = function () {

    interactive.programNameInput = document.getElementById("program-name");

    const parentColumn = document.getElementById("editor-column");
    parentColumn.innerHTML = "";

    for (let i = 0; i < LINE_COUNT; i++) {
        const row = document.createElement("div");
        row.className = "row";

        const addr = document.createElement("div");
        addr.id = `address-${i}`;
        addr.textContent = i.toString().padStart(8, '0');

        const inputWrapper = document.createElement("div");
        inputWrapper.className = "editor-line";

        const inputSpan = document.createElement("input");
        inputSpan.type = "text";
        inputSpan.id = `input-${i}`;
        inputSpan.onkeydown = interactive.onKeyPress;
        inputSpan.oninput = interactive.onKeyPress;
        inputSpan.onfocus = interactive.refreshSelectedLine;
        inputSpan.spellcheck = false;
        inputSpan.maxLength = 64;
        inputSpan.autocomplete = false;

        const inputDisplay = document.createElement("div");
        inputDisplay.className = "display";

        interactive.inputs.push(inputSpan);
        interactive.inputDisplays.push(inputDisplay);

        inputWrapper.appendChild(inputSpan);
        inputWrapper.appendChild(inputDisplay);

        row.appendChild(addr);
        row.appendChild(inputWrapper);

        parentColumn.appendChild(row);
    }
}

interactive.onKeyPress = function (e) {
    if (!ready) {
        return;
    }

    switch (e.key) {
        case "ArrowDown":
        case "Enter":
            if (tutorial.shouldPlayTutorial) {
                if (tutorial.currentTutorialButton) {
                    tutorial.currentTutorialButton.click();
                }
            }
            else {
                interactive.focusNext(1);
            }
            break;

        case "ArrowUp":
            interactive.focusNext(-1);
            break;

        case "Insert":
            interactive.insertNewLine();
            interactive.refreshButtons();
            break;
        case "Delete":
            {
                if (e.shiftKey) {
                    interactive.removeLine();
                    interactive.refreshButtons();
                }
            }
            break;

        default:
            interactive.refreshSelectedLine();
            interactive.refreshButtons();
            break;
    }
}

interactive.refreshSyntaxDetection = function () {
    const currInput = document.activeElement;
    const currInputIndex = interactive.inputs.indexOf(currInput);

    if (currInputIndex >= 0) {
        interactive.refreshSyntaxDetectionOnLine(currInputIndex);
    }
}

interactive.refreshSyntaxDetectionOnLine = function (index) {
    const parseResult = module.exports.tokenize(interactive.inputs[index].value);
    interactive.showParserResult(parseResult, index);

    if (tutorial.shouldPlayTutorial && tutorial.checkTutorialComplete) {
        tutorial.checkTutorialComplete();
    }
}

interactive.insertNewLine = function () {

    const currInput = document.activeElement;
    const currInputIndex = interactive.inputs.indexOf(currInput);

    if (currInputIndex >= 0) {

        let newData = {};
        for (let i = currInputIndex + 1; i < LINE_COUNT; i++) {
            if (interactive.inputs[i]) {
                newData[i] = interactive.inputs[i - 1].value;
            }
        }

        for (let k in newData) {
            interactive.inputs[k].value = newData[k];
            interactive.refreshLine(k);
        }

        interactive.inputs[currInputIndex].value = "";
        interactive.refreshLine(currInputIndex);
    }
}

interactive.removeLine = function () {
    const currInput = document.activeElement;
    const currInputIndex = interactive.inputs.indexOf(currInput);

    if (currInputIndex >= 0) {
        for (let i = currInputIndex; i < LINE_COUNT - 1; i++) {
            interactive.inputs[i].value = interactive.inputs[i + 1].value;
            interactive.refreshLine(i);
        }

        interactive.inputs[LINE_COUNT - 1].value = "";
        interactive.refreshLine(LINE_COUNT - 1);
    }
}

interactive.focusNext = function (offset) {
    const currInput = document.activeElement;
    const currInputIndex = interactive.inputs.indexOf(currInput);
    let nextinputIndex =
        (currInputIndex + offset) % interactive.inputs.length;
    while (nextinputIndex < 0) {
        nextinputIndex = interactive.inputs.length + nextinputIndex;

    }

    const input = interactive.inputs[nextinputIndex];
    input.setSelectionRange(0, 0);
    input.focus();
}

interactive.refreshLine = function (i) {
    if (i >= 0) {

        interactive.refreshCodeLines();
        interactive.refreshSyntaxDetectionOnLine(i);
        interactive.refreshInputForSelection(i);

        interactive.refreshTargetedLines();
    }
}

interactive.refreshSelectedLine = function () {
    const currInput = document.activeElement;
    const currInputIndex = interactive.inputs.indexOf(currInput);

    if (currInputIndex >= 0) {
        interactive.refreshLine(currInputIndex);
    }
}

interactive.refreshTargetedLines = function () {
    const currInput = document.activeElement;
    const currInputIndex = interactive.inputs.indexOf(currInput);

    if (currInputIndex >= 0) {

        // Clear everybody else
        for (let i in interactive.inputs) {

            const input = interactive.inputs[i];

            for (let argIndex = 0; argIndex < 2; argIndex++) {
                input.className = input.className.replace(`target-${argIndex}`, '');
            }
        }

        if (targetedLines.length > 0) {
            const currentCodeLine = codeLineIndices[currInputIndex];
            const reverseCodeLinesMap = {};
            for (let k in codeLineIndices) {
                reverseCodeLinesMap[codeLineIndices[k]] = k;
            }

            for (let i = 0; i < targetedLines.length; i++) {
                if (targetedLines[i] === null) {
                    continue;
                }

                const targetedLine = currentCodeLine + targetedLines[i];
                const inputIndex = reverseCodeLinesMap[targetedLine];

                if (inputIndex != undefined) {
                    const input = document.getElementById(`input-${inputIndex}`);
                    if (input) {
                        input.className += ` target-${i}`;
                    }
                }
            }
        }
    }
}

interactive.refreshCodeLines = function () {
    // Compute code line indices

    trimmedLines.length = 0;
    codeLineIndices.length = 0;

    let codeI = 0;
    for (let i = 0; i < interactive.inputs.length; i++) {
        const input = document.getElementById(`input-${i}`);
        const trimmedContents = input.value.trim();
        const lineIsEmpty = trimmedContents.length == 0;
        const lineIsComment = !lineIsEmpty && (trimmedContents[0] == COMMENT || trimmedContents[0] == META_MAGIC);

        trimmedLines[i] = trimmedContents;

        if (lineIsComment) {
            continue;
        }

        codeI++;
        codeLineIndices[i] = codeI;
    }

    return codeLineIndices;
}

interactive.refreshInputForSelection = function (index) {
    const codeLineIndex = codeLineIndices[index];
    for (let i = 0; i < interactive.inputs.length; i++) {
        const addr = document.getElementById(`address-${i}`);

        const trimmedContents = trimmedLines[i];

        let lineIsCurrent = false;
        const lineIsEmpty = trimmedContents.length == 0;
        const lineIsComment = !lineIsEmpty && (trimmedContents[0] == COMMENT || trimmedContents[0] == META_MAGIC);

        const classes = [];

        if (lineIsEmpty) {
            classes.push("empty-field");
            addr.textContent = "--------";
        } else if (lineIsComment) {
            classes.push("comment-field");
            addr.textContent = "#COMMENT";
        } else if (codeLineIndex == undefined) {
            addr.textContent = '-'.padStart(8, '-');
        }

        if (i == index) {
            addr.textContent = "CURRENT>";
            classes.push("current-field");
            lineIsCurrent = true;
        } else if (codeLineIndex != undefined && !lineIsComment) {
            const visualIndex = codeLineIndex - codeLineIndices[i];
            addr.textContent = `${(i >= codeLineIndex ? "+" : "-")}${(Math.abs(visualIndex)).toString().padStart(7, '0')}`;
        }

        addr.className = "address-field " + classes.join(" ");
        interactive.inputDisplays[i].className = "display " + classes.join(" ");
    }
}

interactive.showParserResult = function (parseResult, index) {

    if (index == undefined) {
        const currInput = document.activeElement;
        index = interactive.inputs.indexOf(currInput);
    }

    targetedLines.length = 0; // clear

    if (index >= 0) {
        let interactiveHelpText = interactive.interactiveTextDiv.innerHTML;
        const display = interactive.inputDisplays[index];
        const val = interactive.inputs[index];

        const tokens = parseResult.tokens;
        if (tokens.length > 0) {
            const token = tokens[0];

            if (token.isComment) {
                interactiveHelpText = "<p>This line is a comment and will not be executed.<br>It serves as documentation for you and whoever might read this program.</p>";
                display.innerHTML = `<span class='comment'>${val.value}</span>`;
            }
            else if (token.isMeta) {
                if (token.isError) {
                    interactiveHelpText = '';
                }
                else {
                    interactiveHelpTextinteractiveHelpText = `<p>This line is an information about the program itself ("self-description").</p><p>It informs that '${token.metaKey}' is '${token.metaValue}'</p>`;
                }

                display.innerHTML = `<span class='meta'>${META_MAGIC}${token.metaKey}</span>${(token.metaValue != "present" ? ` <span class='meta-value'>${token.metaValue}</span>` : '')}`;
            }
            else {
                // Means it's an instruction
                interactiveHelpText = interactive.getHTMLExplanationForStatement(token);
                for (let argIndex in token.arguments) {
                    const a = token.arguments[argIndex];

                    if (a.isReference || a.depth > 0) {
                        targetedLines.push(a.value);
                    }
                    else {
                        targetedLines.push(null);
                    }
                }

                const selection = val.selectionStart;
                const contents = val.value;

                val.value = interactive.fixSpacesInStatement(val.value);

                val.selectionStart = selection;
                val.selectionEnd = selection;

                if (val.value != contents) {
                    interactive.programModified();
                }

                display.innerHTML = interactive.getHTMLForToken(token);
            }
        } else {
            interactiveHelpText = "You can write a statement here!";
            display.textContent = val.value;
        }

        if (parseResult.anyError) {
            const errorMessage = parseResult.tokens[0].errorMessage;
            let html = ``;
            if (parseResult.tokens[0].operation === undefined) {
                html += `<p>Try writing one of the following:</p><p><span class="tutorial-statement">${TUTORIALIZED_OPS
                    .map(o => interactive.getDescriptionForCommand(o).name)
                    .join('</span> | <span class="tutorial-statement">')
                    }</span></p>`;
            }

            html += `<p class='error'><b>This line contains an error!</b><br>${errorMessage}</p>`;

            interactiveHelpText += html;

            if (parseResult.tokens[0].softError) {
                display.innerHTML = `<span class='error'>${val.value}</span>`;
            }
            else {
                display.innerHTML = `<span style='text-decoration:underline; text-decoration-color:red;'>${display.innerHTML}</span>`;
            }
        }

        if (interactive.enableInteractiveHelp) {
            interactive.interactiveTextDiv.innerHTML = interactiveHelpText;
        }
    }
}

interactive.getHTMLExplanationForStatement = function (token) {

    let txt = ``;
    if (token.contents.length == 0) {
        txt = `<p>Add one of the following instructions to your delegate:</p>${interactive.getHTMLOperatorSummary()}`;
    }
    else {
        let commandDescription = false;
        if (token.operation !== undefined && token.contents.length > 0) {
            commandDescription = interactive.getDescriptionForCommand(token.operation);

            const desc = commandDescription;
            txt = `<p><span class="tutorial-statement">${desc.name}</span> ${(
                desc.arguments > 0 ?
                    (
                        desc.arguments > 1 ?
                            `${interactive.wrapHTMLArg("&lt;X&gt;", 0)} <span class='tutorial-link'>${desc.link}</span> ${interactive.wrapHTMLArg("&lt;Y&gt;", 1)}` :
                            interactive.wrapHTMLArg("&lt;X&gt;", 0)
                    )
                    : ""

            )}<br>${desc.text}</p><p style="border-bottom:1px dotted gray;"></p>`;
        }

        const hasArg = token.arguments && token.arguments.length > 0;
        const formattedArgs = [
            interactive.wrapHTMLArg(hasArg && token.arguments[0] && !isNaN(token.arguments[0].value) ? ((token.arguments[0].value >= 0 ? '+' : '') + token.arguments[0].value) : 'X', 0),
            interactive.wrapHTMLArg(hasArg && token.arguments[1] && !isNaN(token.arguments[1].value) ? ((token.arguments[1].value >= 0 ? '+' : '') + token.arguments[1].value) : 'Y', 1)
        ];

        if (token.isInstruction) {
            const isData = token.operation == module.exports.OPERATIONS_DATA;
            switch (token.operation) {
                case module.exports.OPERATIONS.DATA:
                    txt += `
                <p>${(token.arguments && token.arguments.length > 1 && !isNaN(token.arguments[1].value) ? `This cell holds the value "${interactive.wrapHTMLArg(token.arguments[1].value, 0)}"` : `Write any number here to access it later!`)}</p>
                <p><span class="warn">This statement must not be executed!</span> The program will crash if it encounters it, so make sure it won't be reached during execution!</p>
            `;
                    break;

                case module.exports.OPERATIONS.JUMP:
                    {
                        const isDeep = hasArg && token.arguments[0].depth > 0;
                        txt += `<p>Upon execution, this instruction will skip ${(hasArg && !isNaN(token.arguments[0].value) ?
                            (isDeep ?
                                `directly to the position given at address ${formattedArgs[0]}` :
                                interactive.wrapHTMLArg(`${Math.abs(token.arguments[0].value)} cells ${(Math.sign(token.arguments[0].value) > 0 ? 'forward' : 'backwards')}`, 0)
                            ) : 'execution to the address you provide, either forward (+) or backwards (-)'
                        )}, and resume execution at that final position.</p>`;
                    }
                    break;

                case module.exports.OPERATIONS.MOVE:
                    {
                        const isDeep = [
                            hasArg && token.arguments[0].depth > 0,
                            token.arguments.length > 1 && token.arguments[1] && token.arguments[1].depth > 0
                        ];

                        txt +=
                            `<p>This instruction will first copy the ${(isDeep[0] ?
                                `data from the location specified at ${formattedArgs[0]}` :
                                `data found ${formattedArgs[0]} cells from here`
                            )} to the location specified ${(isDeep[1] ?
                                `at the address found at ${formattedArgs[1]}` :
                                `in ${formattedArgs[1]}`
                            )}, and then it will erase the data at ${(isDeep[0] ? `the address specified ${formattedArgs[0]} cells from here` : `the data at ${formattedArgs[0]}`)}</p><p>It only takes a single instruction to do the equivalent of a "copy X to Y, then erase X".</p>`;
                    }
                    break;

                case module.exports.OPERATIONS.COPY:
                    {
                        const isDeep = [
                            hasArg && token.arguments[0].depth > 0,
                            token.arguments.length > 1 && token.arguments[1] && token.arguments[1].depth > 0
                        ];

                        txt +=
                            `<p>Copies all data ${(isDeep[0] ?
                                `from the location specified at ${formattedArgs[0]}` :
                                `from the cell at location ${formattedArgs[0]}`
                            )} to the cell ${(isDeep[1] ?
                                `at the address found at ${formattedArgs[1]}` :
                                `at location ${formattedArgs[1]}`
                            )}</p>`;
                    }
                    break;

                case module.exports.OPERATIONS.WRITE:
                    {
                        const isDeep = [
                            hasArg && token.arguments[0].depth > 0,
                            token.arguments.length > 1 && token.arguments[1] && token.arguments[1].depth > 0
                        ];

                        txt +=
                            `<p>Simply writes ${(isDeep[0] ?
                                `data found at location ${formattedArgs[0]}` :
                                `the number ${formattedArgs[0]}`
                            )} to the cell ${(isDeep[1] ?
                                `at the address found at ${formattedArgs[1]}` :
                                `at location ${formattedArgs[1]}`
                            )}</p>`;
                    }
                    break;

                case module.exports.OPERATIONS.MULTIPLY:
                case module.exports.OPERATIONS.ADD:
                    {
                        const isDeep = [
                            hasArg && token.arguments[0].depth > 0,
                            token.arguments.length > 1 && token.arguments[1] && token.arguments[1].depth > 0
                        ];

                        const sign = token.operation == module.exports.OPERATIONS.ADD ? '+' : 'x';
                        const opName = token.operation == module.exports.OPERATIONS.ADD ? 'sum' : 'product';

                        txt +=
                            `<p>Computes the ${opName} of two numbers: the first one ${(isDeep[0] ?
                                `found at location ${formattedArgs[0]}` :
                                `being ${formattedArgs[0]}`
                            )}, and the second one found ${(isDeep[1] ?
                                `at the address specified at ${formattedArgs[1]}` :
                                `${formattedArgs[1]} cells away from here`
                            )}, and then stores the result at ${(isDeep[1] ? `the address specified at the location written in ${formattedArgs[1]}` : `the location of ${formattedArgs[1]}`)}</p><p>In practice, that means Y is always overwritten with the result of X ${sign} Y</p>`;
                    }
                    break;

                case module.exports.OPERATIONS.SUBTRACT:
                    {
                        const isDeep = [
                            hasArg && token.arguments[0].depth > 0,
                            token.arguments.length > 1 && token.arguments[1] && token.arguments[1].depth > 0
                        ];

                        txt +=
                            `<p>Subtracts two numbers: the first one ${(isDeep[0] ?
                                `found at location ${formattedArgs[0]}` :
                                `being ${formattedArgs[0]}`
                            )} is <u>removed</u> from the second one found ${(isDeep[1] ?
                                `at the address specified at ${formattedArgs[1]}` :
                                `${formattedArgs[1]} cells away from here`
                            )}, and then the result is stored at ${(isDeep[1] ? `the address specified at the location written in ${formattedArgs[1]}` : `the location of ${formattedArgs[1]}`)}</p><p>In practice, that means Y is always overwritten with the result of Y - X</p>`;
                    }
                    break;

                case module.exports.OPERATIONS.SKIP_IF_EQUAL:
                    {
                        const isDeep = [
                            hasArg && token.arguments[0].depth > 0,
                            token.arguments.length > 1 && token.arguments[1] && token.arguments[1].depth > 0
                        ];

                        txt +=
                            `<p>Checks if ${(isDeep[0] ?
                                `the number at ${formattedArgs[0]}` :
                                `${formattedArgs[0]}`
                            )} and ${(isDeep[1] ?
                                `the number at ${formattedArgs[1]}` :
                                `${formattedArgs[1]}`
                            )} are equal.</p><p>If they are equal the NEXT instruction is skipped, so this line acts like a <b>GO TO +2</b>.</p>
                        <p>If they are not equal, this statement will do nothing and execution will resume on the next instruction.</p>`;
                    }
                    break;


                case module.exports.OPERATIONS.SKIP_IF_LOWER:
                case module.exports.OPERATIONS.SKIP_IF_GREATER:
                    {
                        const isDeep = [
                            hasArg && token.arguments[0].depth > 0,
                            token.arguments.length > 1 && token.arguments[1] && token.arguments[1].depth > 0
                        ];

                        const a0 = isDeep[0] ?
                            `the number at ${formattedArgs[0]}` :
                            `${formattedArgs[0]}`;

                        const a1 = isDeep[1] ?
                            `the number at ${formattedArgs[1]}` :
                            `${formattedArgs[1]}`;

                        const isGreaterThan = `is <u>${token.operation == module.exports.OPERATIONS.SKIP_IF_LOWER ? 'lower' : 'greater'}</u> than`;
                        const isNotGreaterThan = `is <u>${token.operation == module.exports.OPERATIONS.SKIP_IF_LOWER ? 'greater' : 'lower'}</u> than`;

                        txt +=
                            `<p>Checks if ${a0} ${isGreaterThan} ${a1}.</p><p>If that is true, the NEXT instruction is skipped, so this line acts like a <b>GO TO +1</b>.</p>
                        <p>If ${a0} ${isNotGreaterThan} ${a1}, this statement will do nothing and execution will resume on the next instruction.</p>`;
                    }
                    break;
            }

            if (!isData && !token.isError && commandDescription && commandDescription.arguments > 0) {
                txt += `<div style="margin-top: auto; vertical-align:bottom;"><p style="border-bottom:1px dotted gray;"></p>`;

                // Add dereferencement explanations
                txt += `<p>You can write arguments either as a plain number or as <u>an address to look up</u> instead.</p><p>To do that, write "${interactive.wrapHTMLArg(`<u>${module.exports.REFERENCE_INDICATORS[0]}</u> X`, 0)
                    }" or "${interactive.wrapHTMLArg(`<u>${module.exports.REFERENCE_INDICATORS[2]}</u> X`, 0)}".</p><p>This will fetch the data from the given address when executing that statement, allowing you to write more complex programs.</p>`;

                txt += `</div>`;
            }
        }
    }

    return txt;
}

interactive.getDescriptionForCommand = function (i) {
    const description = {
        name: Object.keys(module.exports.OPERATIONS)[i],
        text: "",
        arguments: 0,
        link: ""
    };

    switch (i) {
        case module.exports.OPERATIONS.MOVE:
            description.text = "Move data from a memory location to another memory location";
            description.arguments = 2;
            description.link = module.exports.TO_ADDRESS_LINKS[0];
            break;
        case module.exports.OPERATIONS.COPY:
            description.text = "Same as MOVE, but the original location is preserved";
            description.arguments = 2;
            description.link = module.exports.TO_ADDRESS_LINKS[0];
            break;
        case module.exports.OPERATIONS.JUMP:
            description.name = "GO TO";
            description.text = `Skips several cells forward or backwards, depending on whether ${interactive.wrapHTMLArg('X', 0)} is positive (+) or negative (-), and resumes execution there`;
            description.arguments = 1;
            break;
        case module.exports.OPERATIONS.ADD:
            description.text = `Adds ${interactive.wrapHTMLArg('X', 0)} to the value present at ${interactive.wrapHTMLArg('Y', 1)}, and stores the result at address ${interactive.wrapHTMLArg('Y', 1)}`;
            description.arguments = 2;
            description.link = module.exports.TO_WITH_LINKS[0];
            break;
        case module.exports.OPERATIONS.MULTIPLY:
            description.text = `Multiplies ${interactive.wrapHTMLArg('X', 0)} with the value present at ${interactive.wrapHTMLArg('Y', 1)}, and stores the result at address ${interactive.wrapHTMLArg('Y', 1)}`;
            description.arguments = 2;
            description.link = module.exports.WITH_LINKS[0];
            break;
        case module.exports.OPERATIONS.SUBTRACT:
            description.text = `Takes ${interactive.wrapHTMLArg('X', 0)} from the value present at ${interactive.wrapHTMLArg('Y', 1)}, and stores the result at address ${interactive.wrapHTMLArg('Y', 1)}`;
            description.arguments = 2;
            description.link = module.exports.FROM_LINKS[0];
            break;
        case module.exports.OPERATIONS.WRITE:
            description.text = `Writes ${interactive.wrapHTMLArg('X', 0)} at the location given in ${interactive.wrapHTMLArg('Y', 1)}, overwriting what is already there`;
            description.arguments = 2;
            description.link = module.exports.TO_AT_ADDRESS_LINKS[0];
            break;
        case module.exports.OPERATIONS.SKIP_IF_EQUAL:
        case module.exports.OPERATIONS.SKIP_IF_GREATER:
        case module.exports.OPERATIONS.SKIP_IF_LOWER:
            {
                description.name = "SKIP IF";
                description.text = `If ${interactive.wrapHTMLArg('X', 0)} ${SKIP_VERBS[i]} ${interactive.wrapHTMLArg('Y', 1)}, the next instruction is skipped - otherwise this instruction does nothing.`;
                description.arguments = 2;
                description.link = SKIP_LINKS[i];
            }
            break;
        case module.exports.OPERATIONS.DATA:
            description.text = "Declare some data to access or use later";
            break;
        case module.exports.OPERATIONS.NOOP:
            description.name = "DO NOTHING";
            description.text = "Does nothing and proceeds to the next instruction on the next cycle";
            break;
    }

    return description;
}

interactive.wrapHTMLArg = function (txt, i) {
    return `<span class="argument-${i}">${txt}</span>`;
}

interactive.getHTMLOperatorSummary = function () {

    const elements = [];

    for (let k in TUTORIALIZED_OPS) {
        const desc = interactive.getDescriptionForCommand(TUTORIALIZED_OPS[k]);
        elements.push(`<span class="tutorial-statement">${desc.name}</span> ${(
            desc.arguments > 0 ?
                (
                    desc.arguments > 1 ?
                        `${interactive.wrapHTMLArg("&lt;X&gt;", 0)} <span class='tutorial-link'>${desc.link}</span> ${interactive.wrapHTMLArg("&lt;Y&gt;", 1)}` :
                        interactive.wrapHTMLArg("&lt;X&gt;", 0)
                )
                : ""

        )}<br>${desc.text}`);
    }

    return `<ul><li>${elements.join('</li><li>')}</li></ul>`;
}

interactive.getHTMLForToken = function (token) {
    const elems = [];

    const txt = token.operatorText ? token.operatorText : token.contents;
    let minLength = txt;

    elems.push(`<span class="operator">${txt}</span>`);

    if (token.arguments && token.arguments.length > 0) {
        if (token.arguments[0].text) {
            elems.push(interactive.wrapHTMLArg(token.arguments[0].text, 0));
            minLength += token.arguments[0].text.length + 1;
        }

        if (token.arguments.length > 1) {
            if (token.linkText) {
                elems.push(`<span class="link">${token.linkText}</span>`);
            }

            elems.push(interactive.wrapHTMLArg(token.arguments[1].text, 1));
            minLength += token.arguments[1].text.length + 1;
        }
    }

    let final = elems.join(' ');

    if (token.remainingData && token.remainingData.length > 0) {
        final += " <span class='unknown-statement'>" + token.remainingData + "</span>";
    }

    return final;
}

interactive.fixSpacesInStatement = function (str) {
    str = str.replace(/ +/g, ' ').trimStart();

    return str;
}

interactive.programModified = function () {
    trainedForCycles = 0;
    this.refreshTrainingCoreButtons();
}

interactive.initializeSocket = function () {
    socket.on("invalidProgram", function (programName, reason) {
        console.log("Core refused program");
        trainingCoreIsRunning = false;

        interactive.interactiveTextDiv.innerHTML = `<p class="warn">${document.getElementById("core-name").textContent} refused your delegate [${programName}]:</p><p class="error">${reason}</p>`;
        interactive.refreshButtons();
    });

    socket.on("programUploaded", function () {
        console.log("Program uploaded, back to core");
        trainingCoreIsRunning = false;

        interactive.clearTrainingBuffer();

        if (tutorial.shouldPlayTutorial) {
            tutorial.shouldPlayTutorial = false;
            tutorial.reset();
        }

        editorButtons.accessCoreButton.click();
    });


    socket.on("testCore", function (obj) {
        trainingCoreIsRunning = !obj.error;
        if (trainingCoreIsRunning) {
            trainedForCycles++;
        }
        else {
            interactive.clearTrainingBuffer();
            interactive.refreshButtons();
        }

        interactive.refreshTrainingCoreButtons();

        interactive.createTrainingCoreDisplay(obj.columnCount, obj.columnSize);

        if (obj.error) {
            interactive.interactiveTextDiv.innerHTML = `<p class="warn">Delegate training interrupted:</p><p class="error">${obj.error}</p>`;
        }
        else if (obj.delta) {
            interactive.updateTrainingCoreDisplayFromDelta(
                {
                    delta: obj.delta,
                    deltaFlags: obj.deltaFlags,
                    nextAddress: obj.nextAddress
                }
            );
        }
        else if (obj.data) {
            interactive.updateTrainingCoreDisplayFromFullBuffer(
                {
                    data: new Int32Array(obj.data, 0, obj.columnCount * obj.columnSize),
                    flags: new Uint8Array(obj.flags),
                    nextAddress: obj.nextAddress
                }
            );
        }
        else {
            // ??
        }
    });
}

interactive.download = function (data, filename, type) {
    var file = new Blob([data], { type: type });
    if (window.navigator.msSaveOrOpenBlob) // IE10+
        window.navigator.msSaveOrOpenBlob(file, filename);
    else { // Others
        var a = document.createElement("a"),
            url = URL.createObjectURL(file);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 0);
    }
}

interactive.upload = function () {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = ".SRC";

    input.onchange = e => {
        if (e.target.files && e.target.files.length > 0) {
            var file = e.target.files[0];

            // setting up the reader
            var reader = new FileReader();
            reader.readAsText(file, 'UTF-8');

            // here we tell the reader what to do when it's done reading...
            reader.onload = readerEvent => {
                var content = readerEvent.target.result; // this is the content!
                interactive.loadProgram(file.name.replace(".SRC", ""), content);
            }
        }
    }

    input.click();
    document.body.appendChild(input);

    setTimeout(function () {
        document.body.removeChild(input);
    }, 0);
}

interactive.clearTrainingBuffer = function(){
    if (lastTrainingBuffer) {
        for (let k in lastTrainingBuffer) {
            lastTrainingBuffer[k] = 0;
        }
    }

    if (lastTrainingFlagsBuffer) {
        for (let k in lastTrainingFlagsBuffer) {
            lastTrainingFlagsBuffer[k] = 0;
        }
    }

}