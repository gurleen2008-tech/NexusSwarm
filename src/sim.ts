export const MAP_WIDTH = 26;
export const MAP_HEIGHT = 18;
export const STEP_SECONDS = 0.25;

export type Point = { x: number; y: number };
export type Terrain = 0 | 1 | 2 | 3 | 4;
export type VictimState = 'undiscovered' | 'awaiting' | 'assigned' | 'assisting' | 'ready' | 'transported';
export type RoverState = 'idle' | 'navigating' | 'assisting' | 'returning' | 'charging' | 'blocked' | 'failed';
export type AmbulanceState = 'available' | 'en-route' | 'at-pickup' | 'transporting';
export type TaskStatus = 'pending' | 'assigned' | 'blocked' | 'completed';
export type Strategy = 'coordinated' | 'baseline';

export interface Victim {
  id: string;
  position: Point;
  state: VictimState;
  urgent: boolean;
  discoveredAt?: number;
  arrivedAt?: number;
  transportedAt?: number;
}

export interface RescueTask {
  id: string;
  victimId: string;
  position: Point;
  priority: number;
  createdAt: number;
  status: TaskStatus;
  assignedTo?: string;
  reassigned: boolean;
}

export interface Rover {
  id: string;
  position: Point;
  battery: number;
  state: RoverState;
  taskId?: string;
  destination?: Point;
  route: Point[];
  moveClock: number;
  batteryClock: number;
  rescueRemaining: number;
  warnedLow: boolean;
  distance: number;
}

export interface Drone {
  id: string;
  position: Point;
  patrol: Point[];
  patrolIndex: number;
  moveClock: number;
  coverage: Set<string>;
}

export interface Ambulance {
  id: string;
  position: Point;
  state: AmbulanceState;
  victimId?: string;
  route: Point[];
  moveClock: number;
  serviceRemaining: number;
}

export interface MissionEvent {
  id: number;
  time: number;
  kind: 'info' | 'warning' | 'success' | 'failure';
  message: string;
}

export interface SimulationSettings {
  secondsPerBatteryPercent: number;
  lowBatteryThreshold: number;
  criticalBatteryThreshold: number;
  safetyReserve: number;
  chargePercentPerSecond: number;
  rescueDuration: number;
}

export interface SimulationMetrics {
  totalRoverDistance: number;
  blockedMoves: number;
  collisions: number;
  reassignments: number;
  lowBatteryEvents: number;
  completedTasks: number;
  responseTimes: number[];
  transportTimes: number[];
}

export interface BenchmarkResult {
  strategy: Strategy;
  completionRate: number;
  totalDistance: number;
  averageResponse: number;
  reassignments: number;
  blockedMoves: number;
  transported: number;
  victimsDetected: number;
}

export const DEFAULT_SETTINGS: SimulationSettings = {
  secondsPerBatteryPercent: 16,
  lowBatteryThreshold: 38,
  criticalBatteryThreshold: 23,
  safetyReserve: 8,
  chargePercentPerSecond: 2.2,
  rescueDuration: 8,
};

export const keyOf = ({ x, y }: Point) => `${x},${y}`;
export const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const manhattan = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const copyPoint = (point: Point): Point => ({ x: point.x, y: point.y });

function makeTerrain(): Terrain[][] {
  const terrain: Terrain[][] = Array.from({ length: MAP_HEIGHT }, () => Array<Terrain>(MAP_WIDTH).fill(0));
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      if (x === 5 || x === 12 || x === 19 || y === 4 || y === 9 || y === 14) terrain[y][x] = 1;
    }
  }
  const blocks = [
    [7, 1, 10, 3], [14, 1, 17, 3], [2, 6, 4, 8], [8, 6, 10, 8],
    [15, 5, 17, 7], [21, 5, 24, 7], [8, 11, 10, 13], [15, 11, 17, 13],
    [21, 11, 24, 13], [8, 15, 10, 16],
  ];
  for (const [left, top, right, bottom] of blocks) {
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) terrain[y][x] = ((x + y) % 5 === 0 ? 4 : 3) as Terrain;
    }
  }
  for (const [x, y] of [[6, 6], [7, 7], [13, 6], [18, 10], [20, 12], [11, 15], [3, 11], [23, 9]]) {
    if (terrain[y][x] !== 3) terrain[y][x] = 4;
  }
  return terrain;
}

function expandPatrol(waypoints: Point[]): Point[] {
  const path: Point[] = [];
  for (let index = 0; index < waypoints.length; index += 1) {
    const from = waypoints[index];
    const to = waypoints[(index + 1) % waypoints.length];
    if (path.length === 0) path.push(copyPoint(from));
    let x = from.x;
    let y = from.y;
    while (x !== to.x) {
      x += Math.sign(to.x - x);
      path.push({ x, y });
    }
    while (y !== to.y) {
      y += Math.sign(to.y - y);
      path.push({ x, y });
    }
  }
  return path;
}

export class Simulation {
  readonly terrain = makeTerrain();
  readonly obstacles = new Set<string>([keyOf({ x: 5, y: 8 }), keyOf({ x: 19, y: 10 })]);
  readonly chargers: Point[] = [{ x: 2, y: 16 }, { x: 23, y: 2 }];
  readonly hospital: Point = { x: 24, y: 16 };
  readonly dronePads: Point[] = [{ x: 2, y: 2 }, { x: 22, y: 2 }, { x: 2, y: 15 }];
  readonly staging: Point = { x: 1, y: 8 };
  readonly victims: Victim[] = [];
  readonly tasks: RescueTask[] = [];
  readonly rovers: Rover[] = [];
  readonly drones: Drone[] = [];
  readonly ambulances: Ambulance[] = [];
  readonly events: MissionEvent[] = [];
  readonly metrics: SimulationMetrics = {
    totalRoverDistance: 0, blockedMoves: 0, collisions: 0, reassignments: 0,
    lowBatteryEvents: 0, completedTasks: 0, responseTimes: [], transportTimes: [],
  };
  readonly settings: SimulationSettings = { ...DEFAULT_SETTINGS };
  readonly strategy: Strategy;
  elapsed = 0;
  running = false;
  pathsVisible = true;
  private nextVictim = 1;
  private nextTask = 1;
  private nextEvent = 1;
  private readonly reportedRubble = new Set<string>();

  constructor(strategy: Strategy = 'coordinated', settings: SimulationSettings = DEFAULT_SETTINGS) {
    this.strategy = strategy;
    Object.assign(this.settings, settings);
    this.rovers.push(
      this.makeRover('ROVER-01', { x: 2, y: 5 }, 86),
      this.makeRover('ROVER-02', { x: 12, y: 12 }, 74),
      this.makeRover('ROVER-03', { x: 23, y: 8 }, 91),
    );
    this.drones.push(
      this.makeDrone('DRONE-01', [{ x: 2, y: 2 }, { x: 10, y: 2 }, { x: 10, y: 8 }, { x: 16, y: 8 }, { x: 16, y: 2 }]),
      this.makeDrone('DRONE-02', [{ x: 22, y: 2 }, { x: 22, y: 8 }, { x: 22, y: 15 }, { x: 16, y: 15 }, { x: 16, y: 10 }]),
      this.makeDrone('DRONE-03', [{ x: 2, y: 15 }, { x: 2, y: 9 }, { x: 5, y: 13 }, { x: 8, y: 9 }, { x: 8, y: 15 }]),
    );
    this.ambulances.push(this.makeAmbulance('MED-01', { x: 1, y: 8 }), this.makeAmbulance('MED-02', { x: 1, y: 8 }));
    for (const [x, y] of [[9, 8], [16, 9], [21, 14], [5, 13]]) this.addVictim({ x, y }, false, true);
    this.log('info', 'Coordination system online. Three drones beginning sector sweeps.');
    this.log('info', 'Disaster grid loaded: East Ward, fixed seed 042.');
  }

  private makeRover(id: string, position: Point, battery: number): Rover {
    return { id, position: copyPoint(position), battery, state: 'idle', route: [], moveClock: 0, batteryClock: 0, rescueRemaining: 0, warnedLow: false, distance: 0 };
  }

  private makeDrone(id: string, waypoints: Point[]): Drone {
    const patrol = expandPatrol(waypoints);
    return { id, position: copyPoint(patrol[0]), patrol, patrolIndex: 0, moveClock: 0, coverage: new Set([keyOf(patrol[0])]) };
  }

  private makeAmbulance(id: string, position: Point): Ambulance {
    return { id, position: copyPoint(position), state: 'available', route: [], moveClock: 0, serviceRemaining: 0 };
  }

  start() { this.running = true; }
  pause() { this.running = false; }

  tick(seconds = STEP_SECONDS) {
    if (!this.running) return;
    const dt = Math.min(seconds, 1);
    this.elapsed += dt;
    this.moveDrones(dt);
    this.updateRovers(dt);
    this.moveRovers(dt);
    this.dispatchAmbulances();
    this.updateAmbulances(dt);
    this.dispatchTasks();
  }

  updateSettings(settings: Partial<SimulationSettings>) {
    Object.assign(this.settings, settings);
    this.settings.secondsPerBatteryPercent = Math.max(1, this.settings.secondsPerBatteryPercent);
    this.settings.criticalBatteryThreshold = Math.max(1, this.settings.criticalBatteryThreshold);
    this.settings.lowBatteryThreshold = Math.max(this.settings.criticalBatteryThreshold + 1, this.settings.lowBatteryThreshold);
    this.settings.safetyReserve = Math.max(0, this.settings.safetyReserve);
    this.settings.chargePercentPerSecond = Math.max(0.1, this.settings.chargePercentPerSecond);
    this.settings.rescueDuration = Math.max(1, this.settings.rescueDuration);
  }

  addVictim(position: Point, urgent = false, undiscovered = false): Victim | undefined {
    if (!this.isPassable(position) || this.hasUnit(position)) return undefined;
    if (this.victims.some((victim) => samePoint(victim.position, position) && victim.state !== 'transported')) return undefined;
    const victim: Victim = {
      id: `VICTIM-${String(this.nextVictim++).padStart(2, '0')}`,
      position: copyPoint(position), state: undiscovered ? 'undiscovered' : 'awaiting', urgent,
    };
    this.victims.push(victim);
    if (!undiscovered) this.reportVictim(victim, urgent ? 'Urgent rescue request received' : 'Manual victim report received');
    return victim;
  }

  addUrgentVictim(): Victim | undefined {
    const candidates: Point[] = [];
    for (let y = 1; y < MAP_HEIGHT - 1; y += 1) {
      for (let x = 1; x < MAP_WIDTH - 1; x += 1) {
        const point = { x, y };
        if (this.isPassable(point) && !this.hasUnit(point) && !this.victims.some((victim) => samePoint(victim.position, point) && victim.state !== 'transported')) candidates.push(point);
      }
    }
    candidates.sort((a, b) => this.distanceToNearestRover(a) - this.distanceToNearestRover(b));
    const position = candidates.find((point) => point.x % 3 === 1 && point.y % 3 === 1) ?? candidates[0];
    const victim = position && this.addVictim(position, true);
    if (victim) this.log('warning', `${victim.id} marked priority 10. Coordinator evaluating fleet.`);
    return victim;
  }

  toggleObstacle(position: Point): boolean {
    if (!this.inBounds(position) || this.terrain[position.y][position.x] === 3 || this.hasUnit(position) || this.victims.some((victim) => samePoint(victim.position, position) && victim.state !== 'transported')) {
      this.log('warning', 'Cannot alter a protected or occupied map cell.');
      return false;
    }
    const key = keyOf(position);
    if (this.obstacles.has(key)) {
      this.obstacles.delete(key);
      this.log('success', `Route cleared at grid (${position.x}, ${position.y}). Replanning affected units.`);
    } else {
      this.obstacles.add(key);
      this.log('warning', `New blockage reported at grid (${position.x}, ${position.y}). Replanning active routes.`, 'DRONE-02');
    }
    this.replanAll();
    this.dispatchTasks();
    return true;
  }

  failRover(id?: string) {
    const rover = this.rovers.find((item) => item.id === id) ?? this.rovers.find((item) => item.state !== 'failed');
    if (!rover) return;
    this.releaseTask(rover, 'Rover failure');
    rover.state = 'failed';
    rover.destination = undefined;
    rover.route = [];
    this.log('failure', `${rover.id} reported mechanical failure. Unit removed from active fleet.`, rover.id);
    this.dispatchTasks();
  }

  lowerBattery(id?: string) {
    const rover = this.rovers.find((item) => item.id === id) ?? this.rovers.find((item) => item.state !== 'failed');
    if (!rover) return;
    rover.battery = Math.min(rover.battery, this.settings.criticalBatteryThreshold - 1);
    this.log('warning', `${rover.id} battery telemetry set to ${Math.round(rover.battery)}% for demonstration.`, rover.id);
    this.sendToCharge(rover, 'Demonstration battery override');
  }

  private reportVictim(victim: Victim, reason: string, source = 'COORDINATOR') {
    if (victim.state !== 'undiscovered' && this.tasks.some((task) => task.victimId === victim.id)) return;
    victim.state = 'awaiting';
    victim.discoveredAt = this.elapsed;
    const task: RescueTask = {
      id: `TASK-${String(this.nextTask++).padStart(2, '0')}`, victimId: victim.id,
      position: copyPoint(victim.position), priority: victim.urgent ? 10 : 5,
      createdAt: this.elapsed, status: 'pending', reassigned: false,
    };
    this.tasks.push(task);
    this.log(victim.urgent ? 'warning' : 'info', `${source} -> COORDINATOR: ${victim.id} at (${victim.position.x}, ${victim.position.y}). ${reason}.`, source);
    this.dispatchTasks(victim.urgent);
  }

  private moveDrones(dt: number) {
    for (const drone of this.drones) {
      drone.moveClock += dt;
      if (drone.moveClock >= 0.85) {
        drone.moveClock -= 0.85;
        drone.patrolIndex = (drone.patrolIndex + 1) % drone.patrol.length;
        drone.position = copyPoint(drone.patrol[drone.patrolIndex]);
      }
      drone.coverage.add(keyOf(drone.position));
      for (const victim of this.victims) {
        if (victim.state === 'undiscovered' && manhattan(drone.position, victim.position) <= 1) {
          this.reportVictim(victim, `Victim detected at grid (${victim.position.x}, ${victim.position.y})`, drone.id);
        }
      }
      for (let y = Math.max(0, drone.position.y - 1); y <= Math.min(MAP_HEIGHT - 1, drone.position.y + 1); y += 1) {
        for (let x = Math.max(0, drone.position.x - 1); x <= Math.min(MAP_WIDTH - 1, drone.position.x + 1); x += 1) {
          if (this.terrain[y][x] !== 4) continue;
          const key = keyOf({ x, y });
          if (this.reportedRubble.has(key)) continue;
          this.reportedRubble.add(key);
          this.log('warning', `Rubble field reported at grid (${x}, ${y}). Traversal cost elevated.`, drone.id);
        }
      }
    }
  }

  private updateRovers(dt: number) {
    for (const rover of this.rovers) {
      if (rover.state === 'failed') continue;
      if (rover.state === 'charging') {
        rover.battery = Math.min(100, rover.battery + this.settings.chargePercentPerSecond * dt);
        if (rover.battery >= 82) {
          rover.state = 'idle';
          rover.warnedLow = false;
          this.log('success', `${rover.id} charge cycle complete at ${Math.round(rover.battery)}%. Returning to fleet.`, rover.id);
        }
        continue;
      }
      if (rover.state === 'navigating' || rover.state === 'assisting' || rover.state === 'returning') {
        rover.batteryClock += dt;
        while (rover.batteryClock >= this.settings.secondsPerBatteryPercent) {
          rover.batteryClock -= this.settings.secondsPerBatteryPercent;
          rover.battery = Math.max(0, rover.battery - 1);
        }
        if (!rover.warnedLow && rover.battery <= this.settings.lowBatteryThreshold) {
          rover.warnedLow = true;
          this.metrics.lowBatteryEvents += 1;
          this.log('warning', `${rover.id} battery low at ${Math.round(rover.battery)}%. Monitoring task feasibility.`, rover.id);
        }
        if (rover.state !== 'returning' && rover.battery <= this.settings.criticalBatteryThreshold) this.sendToCharge(rover, 'Critical battery threshold reached');
      }
      if (rover.state === 'assisting') {
        rover.rescueRemaining -= dt;
        if (rover.rescueRemaining <= 0) this.finishRescue(rover);
      }
    }
  }

  private moveRovers(dt: number) {
    const proposals: Array<{ rover: Rover; from: Point; to: Point }> = [];
    for (const rover of this.rovers) {
      if (rover.state !== 'navigating' && rover.state !== 'returning') continue;
      rover.moveClock += dt;
      if (rover.moveClock < 1) continue;
      rover.moveClock -= 1;
      const next = rover.route[0];
      if (next) proposals.push({ rover, from: rover.position, to: next });
      else this.arrive(rover);
    }
    const occupied = new Set(this.rovers.filter((rover) => rover.state !== 'failed').map((rover) => keyOf(rover.position)));
    const reserved = new Set<string>();
    const accepted: Array<{ rover: Rover; from: Point; to: Point }> = [];
    for (const proposal of proposals) {
      const destination = keyOf(proposal.to);
      const edge = `${keyOf(proposal.from)}>${destination}`;
      const reverseEdge = `${destination}>${keyOf(proposal.from)}`;
      if (occupied.has(destination) || reserved.has(destination) || reserved.has(reverseEdge) || this.obstacles.has(destination)) {
        this.metrics.blockedMoves += 1;
        proposal.rover.moveClock = Math.min(proposal.rover.moveClock, 0.5);
        continue;
      }
      reserved.add(destination);
      reserved.add(edge);
      accepted.push(proposal);
    }
    for (const { rover, to } of accepted) {
      rover.position = copyPoint(to);
      rover.route.shift();
      rover.distance += 1;
      this.metrics.totalRoverDistance += 1;
      if (rover.route.length === 0) this.arrive(rover);
    }
  }

  private arrive(rover: Rover) {
    if (rover.state === 'returning') {
      rover.state = 'charging';
      rover.destination = undefined;
      rover.route = [];
      this.log('info', `${rover.id} docked at a charging station.`, rover.id);
      return;
    }
    if (rover.state !== 'navigating' || !rover.taskId) return;
    const task = this.tasks.find((item) => item.id === rover.taskId);
    const victim = task && this.victims.find((item) => item.id === task.victimId);
    if (!task || !victim) return;
    rover.state = 'assisting';
    rover.destination = copyPoint(victim.position);
    rover.rescueRemaining = this.settings.rescueDuration;
    victim.state = 'assisting';
    victim.arrivedAt = this.elapsed;
    if (victim.discoveredAt !== undefined) this.metrics.responseTimes.push(this.elapsed - victim.discoveredAt);
    this.log('success', `${rover.id} reached ${victim.id}. Rescue action started.`, rover.id);
  }

  private finishRescue(rover: Rover) {
    const task = this.tasks.find((item) => item.id === rover.taskId);
    const victim = task && this.victims.find((item) => item.id === task.victimId);
    if (!task || !victim) return;
    victim.state = 'ready';
    task.status = 'completed';
    rover.taskId = undefined;
    rover.destination = undefined;
    rover.state = 'idle';
    rover.route = [];
    rover.rescueRemaining = 0;
    this.metrics.completedTasks += 1;
    this.log('success', `${victim.id} stabilized. Ambulance requested at (${victim.position.x}, ${victim.position.y}).`);
  }

  private sendToCharge(rover: Rover, reason: string) {
    if (rover.state === 'failed' || rover.state === 'charging' || rover.state === 'returning') return;
    this.releaseTask(rover, reason);
    const options = this.chargers.map((charger) => ({ charger, route: this.findPath(rover.position, charger) }))
      .filter((item): item is { charger: Point; route: Point[] } => item.route !== undefined)
      .sort((a, b) => a.route.length - b.route.length);
    const nearest = options[0];
    if (!nearest) {
      rover.state = 'blocked';
      rover.route = [];
      rover.destination = undefined;
      this.log('failure', `${rover.id} cannot reach a charging station. Unit remains blocked.`, rover.id);
      return;
    }
    rover.destination = copyPoint(nearest.charger);
    rover.route = nearest.route.slice(1).map(copyPoint);
    rover.state = rover.route.length === 0 ? 'charging' : 'returning';
    this.log('warning', `${rover.id} returning to charge (${Math.round(rover.battery)}%). ${reason}.`, rover.id);
    this.dispatchTasks();
  }

  private releaseTask(rover: Rover, reason: string) {
    if (!rover.taskId) return;
    const task = this.tasks.find((item) => item.id === rover.taskId);
    const victim = task && this.victims.find((item) => item.id === task.victimId);
    if (task && task.status !== 'completed') {
      task.status = 'pending';
      task.assignedTo = undefined;
      task.reassigned = true;
      if (victim) victim.state = 'awaiting';
      this.metrics.reassignments += 1;
      this.log('warning', `${task.id} released by ${rover.id} (${reason}); coordinator reassigning.`);
    }
    rover.taskId = undefined;
  }

  private dispatchTasks(allowPreemption = false) {
    const pending = this.tasks.filter((task) => task.status === 'pending').sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
    for (const task of pending) {
      const candidates = this.rovers.filter((rover) => rover.state === 'idle' && rover.battery > this.settings.criticalBatteryThreshold)
        .map((rover) => {
          const route = this.findPath(rover.position, task.position);
          if (!route) return undefined;
          const chargerRoute = this.chargers.map((charger) => this.findPath(task.position, charger))
            .filter((path): path is Point[] => path !== undefined).sort((a, b) => a.length - b.length)[0];
          if (!chargerRoute) return undefined;
          const travelSeconds = (route.length + chargerRoute.length) * 1.15 + this.settings.rescueDuration;
          const requiredBattery = travelSeconds / this.settings.secondsPerBatteryPercent + this.settings.safetyReserve;
          if (rover.battery < requiredBattery) return undefined;
          const roughCost = route.reduce((sum, point) => sum + (this.terrain[point.y][point.x] === 4 ? 1.2 : 0), 0);
          const score = this.strategy === 'baseline'
            ? route.length + roughCost
            : route.length * 1.15 + roughCost * 1.5 + (100 - rover.battery) * 0.16 - task.priority * 1.8;
          return { rover, route, score };
        }).filter((item): item is { rover: Rover; route: Point[]; score: number } => item !== undefined).sort((a, b) => a.score - b.score);
      let selected = candidates[0];
      if (!selected && allowPreemption && task.priority >= 10) {
        const preemptible = this.rovers
          .filter((rover) => rover.state === 'navigating' && rover.taskId && rover.route.length > 1)
          .filter((rover) => {
            const currentTask = this.tasks.find((item) => item.id === rover.taskId);
            return currentTask && currentTask.priority < task.priority && !currentTask.reassigned;
          })
          .map((rover) => {
            const route = this.findPath(rover.position, task.position);
            const returnRoute = this.chargers.map((charger) => this.findPath(task.position, charger))
              .filter((path): path is Point[] => path !== undefined).sort((a, b) => a.length - b.length)[0];
            if (!route || !returnRoute) return undefined;
            const required = ((route.length + returnRoute.length) * 1.15 + this.settings.rescueDuration) / this.settings.secondsPerBatteryPercent + this.settings.safetyReserve;
            if (rover.battery < required) return undefined;
            return { rover, route, score: route.length + (100 - rover.battery) * 0.16 };
          })
          .filter((item): item is { rover: Rover; route: Point[]; score: number } => item !== undefined)
          .sort((a, b) => a.score - b.score)[0];
        if (preemptible) {
          this.releaseTask(preemptible.rover, `priority ${task.priority} task ${task.id}`);
          preemptible.rover.state = 'idle';
          preemptible.rover.destination = undefined;
          preemptible.rover.route = [];
          preemptible.rover.moveClock = 0;
          selected = preemptible;
          this.log('warning', `${preemptible.rover.id} re-tasked for ${task.id}; lower-priority work returned to queue.`);
        }
      }
      if (!selected) {
        if (!this.hasReachableRover(task.position)) task.status = 'blocked';
        continue;
      }
      const { rover, route } = selected;
      rover.taskId = task.id;
      rover.destination = copyPoint(task.position);
      rover.route = route.slice(1).map(copyPoint);
      rover.state = rover.route.length === 0 ? 'assisting' : 'navigating';
      if (rover.state === 'assisting') this.arrive(rover);
      task.assignedTo = rover.id;
      task.status = 'assigned';
      const victim = this.victims.find((item) => item.id === task.victimId);
      if (victim) victim.state = 'assigned';
      this.log('info', `${task.id} assigned to ${rover.id}; ${this.strategy === 'baseline' ? 'nearest feasible unit' : `score ${selected.score.toFixed(1)}, route ${route.length - 1} cells, battery reserve verified`}.`);
    }
  }

  private hasReachableRover(destination: Point): boolean {
    return this.rovers.some((rover) => rover.state !== 'failed' && this.findPath(rover.position, destination) !== undefined);
  }

  private dispatchAmbulances() {
    for (const victim of this.victims.filter((item) => item.state === 'ready')) {
      const ambulance = this.ambulances.find((item) => item.state === 'available');
      if (!ambulance) break;
      const route = this.findPath(ambulance.position, victim.position);
      if (!route) {
        this.log('failure', `No accessible ambulance route to ${victim.id}; transport request remains open.`);
        continue;
      }
      ambulance.victimId = victim.id;
      ambulance.route = route.slice(1).map(copyPoint);
      ambulance.state = 'en-route';
      if (ambulance.route.length === 0) this.arriveAmbulance(ambulance);
      this.log('info', `${ambulance.id} dispatched for ${victim.id}.`);
    }
  }

  private updateAmbulances(dt: number) {
    for (const ambulance of this.ambulances) {
      if (ambulance.state === 'available') continue;
      if (ambulance.state === 'at-pickup') {
        ambulance.serviceRemaining -= dt;
        if (ambulance.serviceRemaining <= 0) {
          const route = this.findPath(ambulance.position, this.hospital);
          if (!route) {
            this.log('failure', `${ambulance.id} cannot reach the medical centre; victim remains aboard.`, ambulance.id);
            continue;
          }
          ambulance.route = route.slice(1).map(copyPoint);
          ambulance.state = 'transporting';
          if (!ambulance.route.length) this.completeTransport(ambulance);
        }
        continue;
      }
      ambulance.moveClock += dt;
      if (ambulance.moveClock < 0.82) continue;
      ambulance.moveClock -= 0.82;
      const next = ambulance.route.shift();
      if (next) {
        if (this.obstacles.has(keyOf(next))) {
          const destination = ambulance.state === 'transporting' ? this.hospital : this.victims.find((victim) => victim.id === ambulance.victimId)?.position;
          const route = destination && this.findPath(ambulance.position, destination);
          if (!route) {
            ambulance.route = [];
            this.log('failure', `${ambulance.id} route blocked. Transport request held for replanning.`, ambulance.id);
          } else ambulance.route = route.slice(1);
          continue;
        }
        ambulance.position = copyPoint(next);
      }
      if (!ambulance.route.length) {
        if (ambulance.state === 'en-route') this.arriveAmbulance(ambulance);
        else if (ambulance.state === 'transporting') this.completeTransport(ambulance);
      }
    }
  }

  private arriveAmbulance(ambulance: Ambulance) {
    const victim = this.victims.find((item) => item.id === ambulance.victimId);
    if (!victim) return;
    ambulance.position = copyPoint(victim.position);
    ambulance.state = 'at-pickup';
    ambulance.serviceRemaining = 2.5;
    this.log('info', `${ambulance.id} at pickup for ${victim.id}. Patient loading underway.`, ambulance.id);
  }

  private completeTransport(ambulance: Ambulance) {
    const victim = this.victims.find((item) => item.id === ambulance.victimId);
    if (victim) {
      victim.state = 'transported';
      victim.transportedAt = this.elapsed;
      if (victim.discoveredAt !== undefined) this.metrics.transportTimes.push(this.elapsed - victim.discoveredAt);
      this.log('success', `${victim.id} delivered to East Ward Medical Centre.`, ambulance.id);
    }
    ambulance.position = copyPoint(this.hospital);
    ambulance.state = 'available';
    ambulance.victimId = undefined;
    ambulance.route = [];
  }

  private replanAll() {
    for (const rover of this.rovers) {
      if (!rover.destination || rover.state === 'failed' || rover.state === 'charging') continue;
      const route = this.findPath(rover.position, rover.destination);
      if (!route) {
        rover.state = 'blocked';
        rover.route = [];
        const task = this.tasks.find((item) => item.id === rover.taskId);
        if (task) task.status = 'blocked';
        this.log('failure', `${rover.id} destination unreachable after map change. Task held as blocked.`);
      } else {
        rover.route = route.slice(1).map(copyPoint);
        if (rover.state === 'blocked') {
          const task = this.tasks.find((item) => item.id === rover.taskId);
          if (task) task.status = 'assigned';
          rover.state = rover.taskId ? 'navigating' : 'returning';
          this.log('success', `${rover.id} route restored after map update.`);
        }
      }
    }
    for (const ambulance of this.ambulances) {
      if (ambulance.state !== 'en-route' && ambulance.state !== 'transporting') continue;
      const destination = ambulance.state === 'transporting' ? this.hospital : this.victims.find((victim) => victim.id === ambulance.victimId)?.position;
      const route = destination && this.findPath(ambulance.position, destination);
      if (route) ambulance.route = route.slice(1);
    }
  }

  findPath(start: Point, goal: Point): Point[] | undefined {
    if (!this.isPassable(start) || !this.isPassable(goal)) return undefined;
    const startKey = keyOf(start);
    const goalKey = keyOf(goal);
    const open = new Set<string>([startKey]);
    const cameFrom = new Map<string, string>();
    const points = new Map<string, Point>([[startKey, copyPoint(start)]]);
    const gScore = new Map<string, number>([[startKey, 0]]);
    const fScore = new Map<string, number>([[startKey, manhattan(start, goal)]]);
    const directions = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    while (open.size) {
      let currentKey: string | undefined;
      let currentScore = Infinity;
      for (const candidate of open) {
        const score = fScore.get(candidate) ?? Infinity;
        if (score < currentScore) { currentScore = score; currentKey = candidate; }
      }
      if (!currentKey) break;
      if (currentKey === goalKey) {
        const path = [copyPoint(goal)];
        let cursor = currentKey;
        while (cameFrom.has(cursor)) {
          cursor = cameFrom.get(cursor)!;
          path.push(copyPoint(points.get(cursor)!));
        }
        return path.reverse();
      }
      open.delete(currentKey);
      const current = points.get(currentKey)!;
      for (const direction of directions) {
        const neighbor = { x: current.x + direction.x, y: current.y + direction.y };
        if (!this.isPassable(neighbor)) continue;
        const neighborKey = keyOf(neighbor);
        const terrain = this.terrain[neighbor.y][neighbor.x];
        const tentative = (gScore.get(currentKey) ?? Infinity) + (terrain === 4 ? 2.2 : terrain === 1 ? 0.9 : 1);
        if (tentative >= (gScore.get(neighborKey) ?? Infinity)) continue;
        cameFrom.set(neighborKey, currentKey);
        points.set(neighborKey, neighbor);
        gScore.set(neighborKey, tentative);
        fScore.set(neighborKey, tentative + manhattan(neighbor, goal) * 0.9);
        open.add(neighborKey);
      }
    }
    return undefined;
  }

  isPassable(point: Point): boolean {
    return this.inBounds(point) && this.terrain[point.y][point.x] !== 3 && !this.obstacles.has(keyOf(point));
  }

  inBounds(point: Point): boolean { return point.x >= 0 && point.x < MAP_WIDTH && point.y >= 0 && point.y < MAP_HEIGHT; }

  private hasUnit(point: Point): boolean {
    return this.rovers.some((rover) => rover.state !== 'failed' && samePoint(rover.position, point))
      || this.ambulances.some((ambulance) => samePoint(ambulance.position, point) && ambulance.state !== 'available');
  }

  private distanceToNearestRover(point: Point): number {
    return Math.min(...this.rovers.filter((rover) => rover.state !== 'failed').map((rover) => manhattan(rover.position, point)), Infinity);
  }

  private log(kind: MissionEvent['kind'], message: string, source = 'COORDINATOR') {
    this.events.unshift({ id: this.nextEvent++, time: this.elapsed, kind, message: `${source} · ${message}` });
    if (this.events.length > 120) this.events.length = 120;
  }
}

export function runBenchmark(strategy: Strategy, limitSeconds = 900): BenchmarkResult {
  const simulation = new Simulation(strategy);
  simulation.start();
  for (let step = 0; step < Math.ceil(limitSeconds / STEP_SECONDS); step += 1) simulation.tick(STEP_SECONDS);
  const total = simulation.victims.length;
  const responseTimes = simulation.metrics.responseTimes;
  return {
    strategy,
    completionRate: total ? simulation.metrics.completedTasks / total : 0,
    totalDistance: simulation.metrics.totalRoverDistance,
    averageResponse: responseTimes.length ? responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length : 0,
    reassignments: simulation.metrics.reassignments,
    blockedMoves: simulation.metrics.blockedMoves,
    transported: simulation.victims.filter((victim) => victim.state === 'transported').length,
    victimsDetected: simulation.victims.filter((victim) => victim.state !== 'undiscovered').length,
  };
}