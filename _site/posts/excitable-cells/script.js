class Simulation {
    constructor(canvasID, options = {}) {
        this.canvas = document.getElementById(canvasID);
        this.ctx = this.canvas.getContext('2d');

        this.resolution = options.resolution || 15;
        this.cols = Math.floor(this.canvas.width / this.resolution);
        this.rows = Math.floor(this.canvas.height / this.resolution);
        this.resolution = this.canvas.width / this.cols;

        this.fps = options.fps || 20;
        this.steps_pr_frame = options.steps_pr_frame || 5;

        // Cell settings
        this.refractoryTime = options.meanRefractoryTime || 100;

        this.setupImageData();
        this.setupGrid();
        this.setupEventListeners();
    }

    setupGrid() {
        const cellCount = this.cols * this.rows;
        this.cellData = {
            state: new Uint8Array(cellCount),
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

        this.ctx.putImageData(this.imageData, 0, 0);
    }

    animate() {

        for (let i = 0; i < this.steps_pr_frame; i++) {
            this.step();
        }

        this.drawAll();

        // Throttle animation from usual 60 fps to lower.
        setTimeout(() => {
            requestAnimationFrame(() => this.animate());
        }, 1000 / this.fps);

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

// Tiny simulation
let sim_tiny = new Simulation("sim_tiny", 
    { resolution: 50, fps: 8, steps_pr_frame: 1, meanRefractoryTime: 30});
sim_tiny.drawAll();
sim_tiny.animate();

// Pace simulation
let sim_pace = new Simulation("sim_pace", 
    {resolution: 20});
sim_pace.assignCircle(5, 5, 2, { paceTime: 1000 });
sim_pace.drawAll();
sim_pace.animate();

// Setup slider control
const pace_slider = document.getElementById('sim_pace_slider');
const pace_value = document.getElementById('sim_pace_value');

pace_slider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    pace_value.textContent = `${value}ms`;
    sim_pace.assignCircle(5, 5, 2, { paceTime: value });
});


// Initialize simulation
let sim1 = new Simulation("sim1", { resolution: 15 });
sim1.assignCircle(5, 5, 2, { paceTime: 1000 });
sim1.assignCircle(20, 25, 7.5, { dead: 1 });
sim1.assignCircle(30, 25, 4.5, { refractoryTime: 160 });
sim1.assignCircle(35, 25, 4.5, { refractoryTime: 160 });
sim1.drawAll();
sim1.animate();

let sim2 = new Simulation("sim2", { resolution: 5 });

// Update refractory time

noise.seed(Math.random());
const noiseScale = 20;
const noiseGain = 80;

for (let i = 0; i < sim2.cols; i++) {
    for (let j = 0; j < sim2.rows; j++) {
        const idx = sim2.getCellIndex(i, j);

        const simplexNoise = noise.simplex2(i / noiseScale, j / noiseScale);

        sim2.cellData.refractoryTime[idx] = Math.round(simplexNoise * noiseGain + 110);

    }
}

sim2.animate();