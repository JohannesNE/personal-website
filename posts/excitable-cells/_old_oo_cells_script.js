class Simulation {
    constructor(canvasID, options = {}) {
        this.canvas = document.getElementById(canvasID);
        this.ctx = this.canvas.getContext('2d');

        this.resolution = options.resolution || 15;

        this.cols = Math.floor(this.canvas.width / this.resolution);
        this.rows = Math.floor(this.canvas.height / this.resolution);
        this.resolution = this.canvas.width / this.cols
        
        this.setupEventListeners();

        // Initialize grid
        this.grid = make2DArray(this.cols, this.rows);

        for (let i = 0; i < this.cols; i++) {
            for (let j = 0; j < this.rows; j++) {
                this.grid[i][j] = new Cell(i, j);
            }
        }
    }

    getNeighbors(i, j) {
        const directions = [[-1, 0], [0, 1], [1, 0], [0, -1]];
        return directions
            .map(([di, dj]) => {
                const newI = i + di;
                const newJ = j + dj;
                if (this.isValidPosition(newI, newJ)) {
                    return this.grid[newI][newJ];
                }
                return null;
            })
            .filter(cell => cell !== null);
    }

    isValidPosition(i, j) {
        return i >= 0 && i < this.cols && j >= 0 && j < this.rows;
    }

    step() {
        //Update NextState
        for (let i = 0; i < this.cols; i++) {
            for (let j = 0; j < this.rows; j++) {
                const neighbors = this.getNeighbors(i,j);
                this.grid[i][j].updateNextState(neighbors);
            }
        }

        for (let i = 0; i < this.cols; i++) {
            for (let j = 0; j < this.rows; j++) {
                this.grid[i][j].applyNextState();
            }
        }
    }

    drawCell(cell) {
        const refractoryProgress = (cell.refractory_time - cell.time + 1) / cell.refractory_time;
        this.ctx.fillStyle = cell.getColor(refractoryProgress);
        this.ctx.fillRect(
            cell.i * this.resolution,
            cell.j * this.resolution,
            this.resolution,
            this.resolution
        );
    }

    drawAll() {
        for (let i = 0; i < this.grid.length; i++) {
            for (let j = 0; j < this.grid[0].length; j++) {
                this.drawCell(this.grid[i][j]);
            }
        }
    }

    // Animation loop
    animate() {
        this.step();
        this.step();

        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Update states
        this.step();
        
        // Draw all cells
        this.drawAll();


        requestAnimationFrame(() => this.animate());
    }

    assignCircle(centerI, centerJ, radius, prop) {
        for (let i = Math.floor(centerI - radius); i <= centerI + radius; i++) {
            for (let j = Math.floor(centerJ - radius); j <= centerJ + radius; j++) {
                if (i >= 0 && i < this.cols && j >= 0 && j < this.rows) {
                    const distance = Math.hypot(centerI - i, centerJ - j);
                    if (distance <= radius) {
                        Object.assign(this.grid[i][j], prop);
                    }
                }
            }
        }
    }

    handleClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const i = Math.floor(x / this.resolution);
        const j = Math.floor(y / this.resolution);

        if (this.isValidPosition(i, j)) {
            this.grid[i][j].active = 1;
        }
    }

    setupEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.handleClick(e));
    }


}

class Cell {
    constructor(i, j, options = {}) {
        this.i = i;
        this.j = j;
        this.state = 0;
        this.nextState = 0;
        this.active = 0;
        this.time = 0;
        this.preexcite_time = options.preexcite_time || 0;
        this.excite_time = options.excite_time || 10;
        this.refractory_time = options.refractory_time || 100;
        this.dead = options.dead || false;
    }

    updateNextState(neighbors) {
        if (this.dead) return;

        if (this.active === 1) {
            if (this.time >= this.refractory_time) {
                this.time = 0;
                this.active = 0;
                this.nextState = 0;
            } else {
                if (this.time >= this.excite_time) {
                    this.nextState = 2;
                } else if (this.time >= this.preexcite_time) {
                    this.nextState = 1;
                } else {
                    this.nextState = 0;
                }
                this.time++;
            }
        } else {
            if (this.checkNeighbors(neighbors)) {
                this.active = 1;
            }
        }
    }

    applyNextState() {
        this.state = this.nextState;
    }

    checkNeighbors(neighbors) {
        let nExcited = 0;
        for (const neighbor of neighbors) {
            if (neighbor && neighbor.state === 1) {
                nExcited++;
            }
        }
        return nExcited >= Math.floor(Math.random() * 4) + 1;
    }

    getColor(refractoryProgress) {
        if (this.dead) return "#963C1F";
        
        switch (this.state) {
            case 0: return "rgb(220, 220, 220)";
            case 1: return "rgb(50, 50, 50)";
            case 2: {
                const mappedColor = Math.floor(200 - (refractoryProgress * 100));
                return `rgb(${mappedColor}, ${mappedColor}, ${mappedColor})`;
            }
            default: return "rgb(220, 220, 220)";
        }
    }
}

// Utility function to create 2D array
function make2DArray(cols, rows) {
    let arr = new Array(cols);
    for (let i = 0; i < arr.length; i++) {
        arr[i] = new Array(rows);
    }
    return arr;
}

function mapValues(value, start1, stop1, start2, stop2) {
    return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));
}

let sim1 = new Simulation("sim1", {resolution: 15});
// Initial setup
sim1.assignCircle(20, 25, 7.5, { dead: true });
sim1.assignCircle(30, 25, 4.5, { refractory_time: 200 });
sim1.assignCircle(35, 25, 4.5, { refractory_time: 200 });
sim1.drawAll();
sim1.animate();

