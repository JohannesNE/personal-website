class Simulation {
    constructor(canvasID, options = {}) {
        this.canvas = document.getElementById(canvasID);
        this.ctx = this.canvas.getContext('2d');

        this.cols = options.cols || 40;
        this.rows = options.rows || 40;
        this.aspect_ratio = this.cols / this.rows;

        this.resizeCanvas();
      
        this.fps = options.fps || 20;
        this.steps_pr_frame = options.steps_pr_frame || 5;

        // Cell settings
        this.refractoryTime = options.refractoryTime || 100;

        this.paused = false;

        this.setupGrid();
        this.setupEventListeners();
    }

    resizeCanvas() {
        const rect = this.canvas.parentNode.getBoundingClientRect();
        
        // Calculate new dimensions
        this.resolution = Math.floor(rect.width / this.cols);
        const newWidth = this.resolution * this.cols;
        const newHeight = newWidth / this.aspect_ratio;

        // Always update in constructor (when no previous dimensions exist)
        // or when dimensions have actually changed
        if (!this.imageData || this.canvas.width !== newWidth) {
            this.canvas.width = newWidth;
            this.canvas.height = newHeight;
            this.setupImageData();
        }
    }

    setupGrid() {
        const cellCount = this.cols * this.rows;
        this.cellData = {
            state: new Uint8Array(cellCount), // 0: Resting; 1: Active; 2: Refractory;
            nextState: new Uint8Array(cellCount),
            active: new Uint8Array(cellCount),
            time: new Uint16Array(cellCount),
            refractoryTime: new Uint16Array(cellCount).fill(this.refractoryTime),
            exciteTime: new Uint16Array(cellCount).fill(10),
            preexciteTime: new Uint16Array(cellCount).fill(0),
            paceTime: new Uint16Array(cellCount).fill(0), // zero i no pacing (paceTime is infinite)
            dead: new Uint8Array(cellCount)
        };
    }

    setupImageData() {
        // Create ImageData buffer
        this.imageData = this.ctx.createImageData(this.canvas.width, this.canvas.height);
        this.pixels = this.imageData.data;

        // Precalculate pixel positions for each cell
        this.pixelPositions = new Int32Array(this.cols * this.rows);
        for (let j = 0; j < this.rows; j++) {
            for (let i = 0; i < this.cols; i++) {
                const cellIdx = this.getCellIndex(i, j);
                this.pixelPositions[cellIdx] = ((j * this.resolution) * this.canvas.width + (i * this.resolution)) * 4;
            }
        }

        // Create line offset array for resolution
        this.lineOffsets = new Int32Array(this.resolution);
        for (let y = 0; y < this.resolution; y++) {
            this.lineOffsets[y] = y * this.canvas.width * 4;
        }
    }

    getCellIndex(i, j) {
        return i + j * this.cols;
    }

    getNeighbors(i, j) {
        const directions = [[-1, 0], [0, 1], [1, 0], [0, -1]];
        return directions
            .map(([di, dj]) => {
                const newI = i + di;
                const newJ = j + dj;
                if (this.isValidPosition(newI, newJ)) {
                    return this.getCellIndex(newI, newJ);
                }
                return null;
            })
            .filter(idx => idx !== null);
    }

    isValidPosition(i, j) {
        return i >= 0 && i < this.cols && j >= 0 && j < this.rows;
    }

    step() {
        const { state, nextState, active, time, refractoryTime, exciteTime, preexciteTime, paceTime, dead } = this.cellData;

        nextState.set(state);

        for (let i = 0; i < this.cols; i++) {
            for (let j = 0; j < this.rows; j++) {
                const idx = this.getCellIndex(i, j);

                if (dead[idx]) continue;

                if (active[idx] === 1) {
                    if (time[idx] >= refractoryTime[idx]) {
                        //time[idx] = 0;
                        active[idx] = 0;
                        nextState[idx] = 0;
                    } else {
                        if (time[idx] >= exciteTime[idx]) {
                            nextState[idx] = 2;
                        } else if (time[idx] >= preexciteTime[idx]) {
                            nextState[idx] = 1;
                        } else {
                            nextState[idx] = 0;
                        }
                        time[idx]++;
                    }
                } else {
                    // Resting cell
                    if (paceTime[idx] > 0) {
                        // Pacemaker cell
                        if (time[idx] >= paceTime[idx]) {
                            active[idx] = 1;
                            time[idx] = 0;
                            continue;
                        } else {
                            time[idx]++;
                        }
                    }

                    // Check if neighbors are excited
                    const neighbors = this.getNeighbors(i, j);
                    let nExcited = 0;
                    for (const neighborIdx of neighbors) {
                        if (state[neighborIdx] === 1) {
                            nExcited++;
                        }
                    }
                    if (nExcited >= Math.floor(Math.random() * 3) + 1) {
                        active[idx] = 1;
                        time[idx] = 0;
                    }


                }
            }
        }

        this.cellData.state.set(nextState);
    }

    getColor(idx) {
        const { state, time, refractoryTime, dead } = this.cellData;

        if (dead[idx]) {
            return [177, 75, 50]; // #b14b32 in RGB
        }

        switch (state[idx]) {
            case 0: // Resting state
                return [230, 230, 230];
            case 1: // Excited state
                return [50, 50, 50];
            case 2: { // Refractory state
                const refractoryProgress = (refractoryTime[idx] - time[idx] + 1) / refractoryTime[idx];
                const mappedColor = Math.floor(230 - (refractoryProgress * 180));
                return [mappedColor, mappedColor, mappedColor];
            }
            default:
                return [230, 230, 230];
        }
    }

    drawAll() {
        const pixels = this.pixels;
        const resolution = this.resolution;
        const width = this.canvas.width;
        const lineOffsets = this.lineOffsets;

        for (let idx = 0; idx < this.cols * this.rows; idx++) {
            const [r, g, b] = this.getColor(idx);
            const basePixelPos = this.pixelPositions[idx];

            // Fill one row of pixels and copy it resolution times
            for (let x = 0; x < resolution; x++) {
                const pixelPos = basePixelPos + (x * 4);
                pixels[pixelPos] = r;
                pixels[pixelPos + 1] = g;
                pixels[pixelPos + 2] = b;
                pixels[pixelPos + 3] = 255;
            }

            // Copy the first row to all other rows
            const firstRowStart = basePixelPos;
            const rowLength = resolution * 4;
            for (let y = 1; y < resolution; y++) {
                const destPos = firstRowStart + lineOffsets[y];
                for (let x = 0; x < rowLength; x += 4) {
                    pixels[destPos + x] = pixels[firstRowStart + x];
                    pixels[destPos + x + 1] = pixels[firstRowStart + x + 1];
                    pixels[destPos + x + 2] = pixels[firstRowStart + x + 2];
                    pixels[destPos + x + 3] = 255;
                }
            }
        }

        if (this.showRefractoryTimes) {
            this.ctx.save();
            // Clear the canvas first
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            // Draw the base simulation
            // Set up overlay drawing

            // Draw overlay in a single batch
            for (let i = 0; i < this.cols; i++) {
                for (let j = 0; j < this.rows; j++) {
                    const idx = this.getCellIndex(i, j);
                    if (!this.cellData.dead[idx]) {
                        const luminosity = Math.floor(mapValues(this.cellData.refractoryTime[idx], 40, 250, 80, 20));
                        this.ctx.fillStyle = `hsl(210, 50%, ${luminosity}%)`;
                        this.ctx.fillRect(i * resolution, j * resolution, resolution, resolution);
                    }
                }
            }
            this.ctx.restore();
        } else {
            this.ctx.putImageData(this.imageData, 0, 0);
        }
    }

    animate() {
        if (!this.paused) {
            for (let i = 0; i < this.steps_pr_frame; i++) {
                this.step();
            }
        }

        this.drawAll();

        // Throttle animation from usual 60 fps to lower.
        setTimeout(() => {
            requestAnimationFrame(() => this.animate());
        }, 1000 / this.fps);
    }

    defibrillate() {
        const { active, time, dead } = this.cellData;
        
        for (let idx = 0; idx<active.length; idx++) {
            if (dead[idx] === 0) {
                active[idx] = 1;
                time[idx] = 0;
            }
        }
    }

    setRefractoryNoise(noiseScale, noisePercent) {
        for (let i = 0; i < this.cols; i++) {
            for (let j = 0; j < this.rows; j++) {
                const idx = this.getCellIndex(i, j);
        
                const simplexNoise = noise.simplex2(i / noiseScale, j / noiseScale) + 1;

                const fullNoise = 80*simplexNoise**2 - 40*simplexNoise + 50;
                const noiseProp = noisePercent/100.0;
        
                this.cellData.refractoryTime[idx] = Math.round(fullNoise*noiseProp + (1-noiseProp) * 150); // Mix no noise (150) and fullNoise
            }
        }
    }

    assignCircle(centerI, centerJ, radius, prop) {
        for (let i = Math.floor(centerI - radius); i <= centerI + radius; i++) {
            for (let j = Math.floor(centerJ - radius); j <= centerJ + radius; j++) {
                if (this.isValidPosition(i, j)) {
                    const distance = Math.hypot(centerI - i, centerJ - j);
                    if (distance <= radius) {
                        const idx = this.getCellIndex(i, j);
                        for (const [key, value] of Object.entries(prop)) {
                            this.cellData[key][idx] = value;
                        }
                    }
                }
            }
        }
    }

    handleClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const i = Math.floor((event.clientX - rect.left) / this.resolution);
        const j = Math.floor((event.clientY - rect.top) / this.resolution);

        if (this.isValidPosition(i, j)) {
            const idx = this.getCellIndex(i, j);
            if (this.cellData.state[idx] === 0 && this.cellData.dead[idx] === 0) {
                this.cellData.active[idx] = 1;
                this.cellData.time[idx] = 0;
            }
        }
    }

    setupEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.handleClick(e));
        window.addEventListener('resize', () => this.resizeCanvas());
    }
}

function mapValues(value, start1, stop1, start2, stop2) {
    return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));
}

// Standard Normal variate using Box-Muller transform. (From https://stackoverflow.com/questions/25582882/javascript-math-random-normal-distribution-gaussian-bell-curve)
function gaussianRandom(mean = 0, stdev = 1, min = -Infinity) {
    const u = 1 - Math.random(); // Converting [0,1) to (0,1]
    const v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    // Transform to the desired mean and standard deviation:
    let res = z * stdev + mean;

    if (res > min) {
        return res;
    } else {
        return gaussianRandom(mean, stdev, min);
    }
}

// ## 1. Tiny simulation
let sim_tiny = new Simulation("sim_tiny", 
    { cols: 15, rows: 15, fps: 8, steps_pr_frame: 1, refractoryTime: 30});
sim_tiny.drawAll();
sim_tiny.animate();

// ## 2. Pace simulation
let sim_pace = new Simulation("sim_pace", 
    {cols: 20, rows: 20});
sim_pace.assignCircle(1, 1, 2.5, { paceTime: 160, active: 1, state: 1 });
sim_pace.drawAll();
sim_pace.animate();

// Setup slider control
const slider_pace = document.getElementById("slider_sim_pace");

slider_pace.addEventListener("input", (e) => {
    const value = 10000 / parseInt(e.target.value);
    sim_pace.assignCircle(5, 5, 2, { paceTime: value });
});

// ## 3. Reentry simulation 1
let sim_reentry1 = new Simulation("sim_reentry1", { cols: 30, rows: 30 });
// Activate cells
sim_reentry1.assignCircle(10, 1, 2.5, {active: 1, state: 1});
// Make cells to the right refractory to make depolarization propagate one way only.
sim_reentry1.assignCircle(20, 8, 8.5, {active: 1, state: 2, time: 50});
// Dead cells in the middle.
sim_reentry1.assignCircle(15, 15, 5.5, { dead: 1 });
// Setup pacemaker in corner
sim_reentry1.assignCircle(1, 1, 2.5, { paceTime: 250, active: 1, state: 1 });
sim_reentry1.drawAll();
sim_reentry1.animate();

// Setup button
const button_reentry1 = document.getElementById("button_reentry1");

button_reentry1.addEventListener("click", () => {
    sim_reentry1.defibrillate();
})


// ## 4. Reentry simulation 2
let sim_reentry2 = new Simulation("sim_reentry2", { cols: 30, rows: 30, refractoryTime: 60});
sim_reentry2.assignCircle(1, 1, 2.5, { paceTime: 200, active: 1, state: 1 });
sim_reentry2.assignCircle(15, 15, 6.5, { dead: 1 });
// Make make area with longer refractory time
sim_reentry2.assignCircle(5, 20, 10.5, { refractoryTime: 140});

sim_reentry2.drawAll();  
sim_reentry2.animate();

// Setup button
const button_reentry2 = document.getElementById("button_reentry2");

button_reentry2.addEventListener("click", () => {
    sim_reentry2.defibrillate();
})

// ## 5. Afib simulation
let sim_afib = new Simulation("sim_afib", { cols: 80, rows: 80 });

// Update refractory time
noise.seed(Math.random());
const noiseScale = 20;
const noisePercent = 40;

sim_afib.setRefractoryNoise(noiseScale, noisePercent);
sim_afib.assignCircle(1, 1, 2.5, { paceTime: 300, active: 1, state: 1 });

sim_afib.showRefractoryTimes = false;

sim_afib.animate();

// Setup slider control
const slider_afib_scale = document.getElementById("slider_afib_scale");
const slider_afib_percent = document.getElementById("slider_afib_percent");

function setNoise() {
    const noiseScale = parseInt(slider_afib_scale.value);
    const noisePercent = parseInt(slider_afib_percent.value);

    sim_afib.setRefractoryNoise(noiseScale, noisePercent);
}

function setupSliderEvents(slider) {
    // Pointer start
    slider.addEventListener("pointerdown", () => {
        console.log("pointerdown");
        sim_afib.showRefractoryTimes = true;
        sim_afib.paused = true;
        setNoise();
    });

    // Input for continuous updates
    slider.addEventListener("input", () => {
        console.log("input");
        setNoise();
    });

    // Pointer end
    slider.addEventListener("pointerup", () => {
        console.log("pointerup");
        sim_afib.showRefractoryTimes = false;
        sim_afib.paused = false;
        setNoise();
    });
}

// Apply events to both sliders
setupSliderEvents(slider_afib_scale);
setupSliderEvents(slider_afib_percent);

// Setup button
const button_afib = document.getElementById("button_afib");

button_afib.addEventListener("click", () => {
    sim_afib.defibrillate();
})