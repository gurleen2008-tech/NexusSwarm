import { describe, expect, it } from 'vitest';
import { Simulation, STEP_SECONDS, runBenchmark } from './sim';

describe('Nexus Swarm simulation', () => {
  it('finds weighted, obstacle-free routes and reports unreachable cells', () => {
    const simulation = new Simulation();
    const route = simulation.findPath({ x: 2, y: 5 }, { x: 8, y: 5 });
    expect(route).toBeDefined();
    expect(route?.[0]).toEqual({ x: 2, y: 5 });
    expect(route?.[route.length - 1]).toEqual({ x: 8, y: 5 });
    expect(route?.some((point) => simulation.terrain[point.y][point.x] === 3)).toBe(false);
    expect(simulation.findPath({ x: 2, y: 5 }, { x: -1, y: 5 })).toBeUndefined();
  });

  it('transports a reported victim through the complete rescue workflow', () => {
    const simulation = new Simulation();
    const victim = simulation.addVictim({ x: 6, y: 10 });
    expect(victim).toBeDefined();
    simulation.start();
    for (let index = 0; index < 2400 && victim?.state !== 'transported'; index += 1) simulation.tick(STEP_SECONDS);
    expect(victim?.state).toBe('transported');
    expect(simulation.metrics.completedTasks).toBeGreaterThan(0);
    expect(simulation.metrics.responseTimes.length).toBeGreaterThan(0);
    expect(simulation.metrics.transportTimes.length).toBeGreaterThan(0);
    expect(simulation.events.some((event) => event.message.includes('delivered to East Ward Medical Centre'))).toBe(true);
  });

  it('releases an active task on rover failure and prevents the failed unit from moving', () => {
    const simulation = new Simulation();
    const victim = simulation.addVictim({ x: 6, y: 10 });
    const failedRover = simulation.rovers.find((rover) => rover.taskId !== undefined)!;
    const original = { ...failedRover.position };
    simulation.failRover(failedRover.id);
    simulation.start();
    for (let index = 0; index < 20; index += 1) simulation.tick(STEP_SECONDS);
    expect(failedRover.state).toBe('failed');
    expect(failedRover.position).toEqual(original);
    expect(failedRover.taskId).toBeUndefined();
    expect(simulation.tasks.find((task) => task.victimId === victim?.id)?.assignedTo).not.toBe(failedRover.id);
    expect(simulation.metrics.reassignments).toBe(1);
  });

  it('reserves rover destinations and records blocked movement without collisions', () => {
    const simulation = new Simulation();
    const [first, second] = simulation.rovers;
    first.position = { x: 8, y: 10 };
    second.position = { x: 10, y: 10 };
    for (const rover of [first, second]) {
      rover.state = 'navigating';
      rover.destination = { x: 9, y: 10 };
      rover.route = [{ x: 9, y: 10 }];
    }
    simulation.start();
    for (let index = 0; index < 8; index += 1) simulation.tick(STEP_SECONDS);
    expect([first.position, second.position].filter((point) => point.x === 9 && point.y === 10)).toHaveLength(1);
    expect(simulation.metrics.collisions).toBe(0);
    expect(simulation.metrics.blockedMoves).toBeGreaterThan(0);
  });

  it('rejects opposing rover moves across the same edge', () => {
    const simulation = new Simulation();
    const [first, second] = simulation.rovers;
    first.position = { x: 8, y: 10 };
    second.position = { x: 9, y: 10 };
    first.state = 'navigating';
    second.state = 'navigating';
    first.route = [{ x: 9, y: 10 }];
    second.route = [{ x: 8, y: 10 }];
    simulation.start();
    for (let index = 0; index < 8; index += 1) simulation.tick(STEP_SECONDS);
    expect(first.position).toEqual({ x: 8, y: 10 });
    expect(second.position).toEqual({ x: 9, y: 10 });
    expect(simulation.metrics.blockedMoves).toBeGreaterThan(0);
    expect(simulation.metrics.collisions).toBe(0);
  });

  it('reports drone discoveries to the coordinator before creating rescue tasks', () => {
    const simulation = new Simulation();
    simulation.start();
    for (let index = 0; index < 100; index += 1) simulation.tick(STEP_SECONDS);
    expect(simulation.victims.some((victim) => victim.state !== 'undiscovered')).toBe(true);
    expect(simulation.tasks.length).toBeGreaterThan(0);
    expect(simulation.events.some((event) => event.message.includes('DRONE-01 -> COORDINATOR'))).toBe(true);
  });

  it('preempts one lower-priority assignment for a feasible urgent request', () => {
    const simulation = new Simulation();
    simulation.addVictim({ x: 6, y: 10 });
    simulation.addVictim({ x: 15, y: 10 });
    simulation.addVictim({ x: 20, y: 9 });
    expect(simulation.rovers.filter((rover) => rover.state === 'navigating')).toHaveLength(3);
    const urgent = simulation.addUrgentVictim();
    expect(urgent?.urgent).toBe(true);
    expect(simulation.tasks.find((task) => task.victimId === urgent?.id)?.assignedTo).toBeDefined();
    expect(simulation.metrics.reassignments).toBeGreaterThan(0);
  });

  it('hands off a task and returns a critically low rover to charge', () => {
    const simulation = new Simulation();
    const victim = simulation.addVictim({ x: 6, y: 10 });
    const rover = simulation.rovers.find((unit) => unit.taskId !== undefined)!;
    simulation.lowerBattery(rover.id);
    const task = simulation.tasks.find((item) => item.victimId === victim?.id);
    expect(['returning', 'charging']).toContain(rover.state);
    expect(task?.assignedTo).toBeDefined();
    expect(task?.assignedTo).not.toBe(rover.id);
    expect(simulation.metrics.reassignments).toBe(1);
  });

  it('replans around a newly blocked route cell', () => {
    const simulation = new Simulation();
    simulation.addVictim({ x: 6, y: 10 });
    const rover = simulation.rovers.find((unit) => unit.taskId !== undefined)!;
    const blocked = rover.route[0];
    expect(blocked).toBeDefined();
    simulation.toggleObstacle(blocked);
    expect(rover.state).toBe('navigating');
    expect(rover.route.some((point) => point.x === blocked.x && point.y === blocked.y)).toBe(false);
  });

  it('uses simulated seconds for battery drain and freezes time when paused', () => {
    const simulation = new Simulation();
    const rover = simulation.rovers[0];
    rover.state = 'navigating';
    simulation.start();
    for (let index = 0; index < 63; index += 1) simulation.tick(STEP_SECONDS);
    expect(rover.battery).toBe(86);
    simulation.tick(STEP_SECONDS);
    expect(rover.battery).toBe(85);
    simulation.pause();
    const elapsed = simulation.elapsed;
    simulation.tick(10);
    expect(simulation.elapsed).toBe(elapsed);
  });

  it('produces repeatable measured baseline runs', () => {
    const firstRun = runBenchmark('coordinated', 60);
    const secondRun = runBenchmark('coordinated', 60);
    const baseline = runBenchmark('baseline', 60);
    expect(firstRun).toEqual(secondRun);
    expect(firstRun.victimsDetected).toBeGreaterThan(0);
    expect(baseline.strategy).toBe('baseline');
    expect(Number.isFinite(baseline.totalDistance)).toBe(true);
  });
});