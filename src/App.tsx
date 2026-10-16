import {
  Activity, AlertTriangle, BatteryCharging,
  Bot, Check, CheckCircle2, ChevronDown, CircleHelp, Clock3, Crosshair, HeartPulse,
  Map, Maximize2, Menu, Pause, Play, Plus, Radio, RotateCcw,
  Route, Settings2, ShieldAlert, Signal, Target, Waves,
  X, Zap, ZoomIn, ZoomOut,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MapCanvas } from './MapCanvas';
import {
  BenchmarkResult, MissionEvent, Point, Simulation, SimulationSettings,
  STEP_SECONDS, runBenchmark,
} from './sim';

type MapTool = 'select' | 'victim' | 'obstacle';
type Pan = { x: number; y: number };
type Benchmarks = { coordinated: BenchmarkResult; baseline: BenchmarkResult };

const formatTime = (seconds: number) => {
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remainder = whole % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
};

const coord = (point?: Point) => point ? `${String(point.x).padStart(2, '0')}, ${String(point.y).padStart(2, '0')}` : 'No destination';
const average = (values: number[]) => values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
const stateLabel = (state: string) => state.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function EventIcon({ kind }: { kind: MissionEvent['kind'] }) {
  if (kind === 'success') return <CheckCircle2 size={13} />;
  if (kind === 'warning') return <AlertTriangle size={13} />;
  if (kind === 'failure') return <ShieldAlert size={13} />;
  return <Radio size={13} />;
}

function App() {
  const [simulation, setSimulation] = useState(() => new Simulation());
  const [revision, setRevision] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [selectedId, setSelectedId] = useState('ROVER-01');
  const [tool, setTool] = useState<MapTool>('select');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [showCoordinates, setShowCoordinates] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [benchmarks, setBenchmarks] = useState<Benchmarks>();
  const animationRef = useRef<number>(0);

  useEffect(() => {
    let previous = performance.now();
    let accumulator = 0;
    const animate = (now: number) => {
      accumulator += Math.min(0.25, (now - previous) / 1000) * speed;
      previous = now;
      let changed = false;
      while (accumulator >= STEP_SECONDS) {
        simulation.tick(STEP_SECONDS);
        accumulator -= STEP_SECONDS;
        changed = true;
      }
      if (changed) setRevision((value) => value + 1);
      animationRef.current = requestAnimationFrame(animate);
    };
    if (simulation.running) animationRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationRef.current);
  }, [simulation, simulation.running, speed]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const coordinated = runBenchmark('coordinated', 900);
      const baseline = runBenchmark('baseline', 900);
      if (!cancelled) setBenchmarks({ coordinated, baseline });
    }, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const forceUpdate = () => setRevision((value) => value + 1);
  const handleStart = () => { simulation.start(); forceUpdate(); };
  const handlePause = () => { simulation.pause(); forceUpdate(); };

  function resetSimulation() {
    simulation.pause();
    setSimulation(new Simulation());
    setRevision(0);
    setSelectedId('ROVER-01');
    setTool('select');
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSpeed(1);
  }

  function updateSetting<K extends keyof SimulationSettings>(key: K, value: number) {
    simulation.updateSettings({ [key]: value });
    forceUpdate();
  }

  function handleMapPoint(point: Point) {
    if (tool === 'victim') {
      const victim = simulation.addVictim(point);
      if (victim) setSelectedId(victim.id);
      setTool('select');
    } else if (tool === 'obstacle') {
      simulation.toggleObstacle(point);
    } else {
      const victim = simulation.victims.find((item) => item.state !== 'undiscovered' && item.state !== 'transported' && item.position.x === point.x && item.position.y === point.y);
      if (victim) setSelectedId(victim.id);
    }
    forceUpdate();
  }

  function triggerFailure() {
    simulation.failRover(selectedId.startsWith('ROVER') ? selectedId : undefined);
    forceUpdate();
  }

  function triggerBattery() {
    simulation.lowerBattery(selectedId.startsWith('ROVER') ? selectedId : undefined);
    forceUpdate();
  }

  const selectedRover = simulation.rovers.find((unit) => unit.id === selectedId);
  const selectedDrone = simulation.drones.find((unit) => unit.id === selectedId);
  const selectedAmbulance = simulation.ambulances.find((unit) => unit.id === selectedId);
  const selectedVictim = simulation.victims.find((unit) => unit.id === selectedId);
  const selectedUnit = selectedRover ?? selectedDrone ?? selectedAmbulance ?? selectedVictim;
  const detectedVictims = simulation.victims.filter((victim) => victim.state !== 'undiscovered');
  const awaitingVictims = simulation.victims.filter((victim) => victim.state === 'awaiting' || victim.state === 'assigned').length;
  const assistedVictims = simulation.victims.filter((victim) => victim.state === 'assisting' || victim.state === 'ready').length;
  const transportedVictims = simulation.victims.filter((victim) => victim.state === 'transported').length;
  const activeRovers = simulation.rovers.filter((rover) => ['navigating', 'assisting', 'returning'].includes(rover.state)).length;
  const idleRovers = simulation.rovers.filter((rover) => rover.state === 'idle').length;
  const chargingRovers = simulation.rovers.filter((rover) => rover.state === 'charging' || rover.state === 'returning').length;
  const failedRovers = simulation.rovers.filter((rover) => rover.state === 'failed').length;
  const pendingTasks = simulation.tasks.filter((task) => task.status === 'pending' || task.status === 'blocked').length;
  const assignedTasks = simulation.tasks.filter((task) => task.status === 'assigned').length;
  const remainingTasks = simulation.tasks.filter((task) => task.status !== 'completed').length;
  const averageBattery = average(simulation.rovers.filter((rover) => rover.state !== 'failed').map((rover) => rover.battery));
  const utilization = simulation.rovers.length ? activeRovers / simulation.rovers.length * 100 : 0;
  const selectedTask = selectedRover?.taskId ? simulation.tasks.find((task) => task.id === selectedRover.taskId) : undefined;
  const selectedVictimForTask = selectedTask ? simulation.victims.find((victim) => victim.id === selectedTask.victimId) : undefined;
  const currentAlerts = simulation.rovers.filter((rover) => rover.state === 'blocked' || (rover.battery <= simulation.settings.lowBatteryThreshold && rover.state !== 'failed')).length
    + simulation.tasks.filter((task) => task.status === 'blocked').length;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Waves size={20} strokeWidth={2.3} /></div>
          <div className="brand-copy">
            <div className="brand-name">NEXUS<span>SWARM</span></div>
            <div className="brand-subtitle">RESCUE COORDINATION SYSTEM</div>
          </div>
        </div>
        <div className="topbar-divider" />
        <div className="scenario-tag"><span className="live-dot" /> EAST WARD / SCENARIO 042</div>
        <div className="topbar-spacer" />
        <div className={`sim-state ${simulation.running ? 'sim-state--live' : ''}`}>
          <span className="state-indicator" />{simulation.running ? 'SIMULATION LIVE' : 'SIMULATION PAUSED'}
        </div>
        <div className="clock-readout"><Clock3 size={14} /><span>{formatTime(simulation.elapsed)}</span><small>SIM TIME</small></div>
        <label className="speed-select" title="Simulation speed">
          <Zap size={14} />
          <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))} aria-label="Simulation speed">
            <option value={0.5}>0.5x</option><option value={1}>1x</option><option value={2}>2x</option><option value={4}>4x</option>
          </select>
          <ChevronDown size={12} />
        </label>
        <div className="view-pill" title="Live 2D view. 3D is an optional future extension."><Map size={13} /> 2D <small>3D OPTIONAL</small></div>
        <button className={`icon-button ${settingsOpen ? 'icon-button--active' : ''}`} title="Simulation settings" aria-label="Simulation settings" onClick={() => setSettingsOpen((open) => !open)}><Settings2 size={17} /></button>
      </header>

      <main className={`workspace ${leftCollapsed ? 'workspace--left-closed' : ''} ${rightCollapsed ? 'workspace--right-closed' : ''}`}>
        {!leftCollapsed && <aside className="sidebar sidebar-left">
          <section className="side-section fleet-section">
            <div className="section-heading"><span>FLEET OVERVIEW</span><button className="micro-icon" title="Collapse fleet sidebar" onClick={() => setLeftCollapsed(true)}><Menu size={14} /></button></div>
            <div className="fleet-totals">
              <div><strong>{simulation.drones.length}</strong><span>DRONES</span><small>SECTOR SWEEP</small></div>
              <div><strong>{simulation.rovers.length}</strong><span>ROVERS</span><small>GROUND UNITS</small></div>
              <div><strong>{simulation.ambulances.length}</strong><span>MEDICAL</span><small>TRANSPORT</small></div>
            </div>
            <div className="fleet-state-row">
              <span className="status-key"><i className="key-dot key-dot--teal" /> ACTIVE <b>{activeRovers}</b></span>
              <span className="status-key"><i className="key-dot key-dot--gray" /> IDLE <b>{idleRovers}</b></span>
            </div>
            <div className="fleet-state-row fleet-state-row--last">
              <span className="status-key"><i className="key-dot key-dot--amber" /> CHARGING <b>{chargingRovers}</b></span>
              <span className="status-key"><i className="key-dot key-dot--red" /> FAILED <b>{failedRovers}</b></span>
            </div>
          </section>

          <section className="side-section mission-section">
            <div className="section-heading"><span>RESCUE MISSION</span><span className="section-live"><span className="tiny-dot" />LIVE</span></div>
            <div className="mission-stat-grid">
              <div className="mission-stat"><small>DETECTED</small><strong>{detectedVictims.length}<span>/{simulation.victims.length}</span></strong></div>
              <div className="mission-stat"><small>AWAITING</small><strong className="text-amber">{awaitingVictims}</strong></div>
              <div className="mission-stat"><small>ASSISTING</small><strong className="text-orange">{assistedVictims}</strong></div>
              <div className="mission-stat"><small>SAFE</small><strong className="text-green">{transportedVictims}</strong></div>
            </div>
            <div className="mission-progress-head"><span>Task queue</span><span>{assignedTasks} active <b>·</b> {pendingTasks} pending</span></div>
            <div className="progress-track"><span style={{ width: `${simulation.tasks.length ? simulation.metrics.completedTasks / simulation.tasks.length * 100 : 0}%` }} /></div>
          </section>

          <section className="side-section unit-list-section">
            <div className="section-heading"><span>UNIT ROSTER</span><span className="roster-count">{simulation.rovers.length + simulation.drones.length + simulation.ambulances.length} UNITS</span></div>
            <div className="unit-roster">
              {simulation.drones.map((drone) => <button key={drone.id} className={`roster-row ${selectedId === drone.id ? 'roster-row--selected' : ''}`} onClick={() => setSelectedId(drone.id)}>
                <span className="roster-icon roster-icon--drone"><Crosshair size={14} /></span><span className="roster-label"><b>{drone.id}</b><small>AERIAL / PATROL</small></span><span className="roster-state roster-state--patrol">SWEEP</span>
              </button>)}
              {simulation.rovers.map((rover) => <button key={rover.id} className={`roster-row ${selectedId === rover.id ? 'roster-row--selected' : ''}`} onClick={() => setSelectedId(rover.id)}>
                <span className={`roster-icon ${rover.state === 'failed' ? 'roster-icon--failed' : 'roster-icon--rover'}`}><Bot size={14} /></span><span className="roster-label"><b>{rover.id}</b><small>GROUND / {Math.round(rover.battery)}% BAT</small></span><span className={`roster-state roster-state--${rover.state}`}>{rover.state.toUpperCase()}</span>
              </button>)}
              {simulation.ambulances.map((ambulance) => <button key={ambulance.id} className={`roster-row ${selectedId === ambulance.id ? 'roster-row--selected' : ''}`} onClick={() => setSelectedId(ambulance.id)}>
                <span className="roster-icon roster-icon--medical"><HeartPulse size={14} /></span><span className="roster-label"><b>{ambulance.id}</b><small>MEDICAL / TRANSPORT</small></span><span className={`roster-state roster-state--${ambulance.state}`}>{ambulance.state === 'available' ? 'READY' : 'EN ROUTE'}</span>
              </button>)}
            </div>
          </section>

          <section className="side-section event-section">
            <div className="section-heading"><span>MISSION EVENT LOG</span><span className="event-count">{simulation.events.length} EVENTS</span></div>
            <div className="event-list">
              {simulation.events.slice(0, 18).map((event) => <div className={`event-row event-row--${event.kind}`} key={event.id}>
                <span className="event-icon"><EventIcon kind={event.kind} /></span>
                <div className="event-copy"><p>{event.message}</p><time>{formatTime(event.time)}</time></div>
              </div>)}
              {!simulation.events.length && <div className="empty-state">Awaiting first telemetry event.</div>}
            </div>
          </section>
        </aside>}

        <section className="map-column">
          <div className="map-topline">
            <div className="map-title-wrap">
              {leftCollapsed && <button className="micro-icon reopen-sidebar" title="Show fleet sidebar" onClick={() => setLeftCollapsed(false)}><Menu size={15} /></button>}
              <div><div className="map-title"><span className="map-title-mark"><Activity size={16} /></span> EAST WARD <span className="map-title-divider">/</span> URBAN RESPONSE ZONE</div><div className="map-subtitle">26 × 18 GRID <span>·</span> 4.2 KM² <span>·</span> COORDINATES {showCoordinates ? 'ON' : 'OFF'}</div></div>
            </div>
            <div className="map-actions">
              <button className={`map-control ${showCoordinates ? 'map-control--on' : ''}`} onClick={() => setShowCoordinates((value) => !value)} title="Toggle grid coordinates">XY</button>
              <button className={`map-control ${simulation.pathsVisible ? 'map-control--on' : ''}`} onClick={() => { simulation.pathsVisible = !simulation.pathsVisible; forceUpdate(); }} title="Toggle navigation paths"><Route size={15} /></button>
              <span className="map-action-divider" />
              <button className="map-control" title="Zoom out" onClick={() => setZoom((value) => Math.max(0.75, value - 0.1))}><ZoomOut size={15} /></button>
              <span className="zoom-label">{Math.round(zoom * 100)}%</span>
              <button className="map-control" title="Zoom in" onClick={() => setZoom((value) => Math.min(1.8, value + 0.1))}><ZoomIn size={15} /></button>
              <button className="map-control" title="Reset map view" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><Maximize2 size={14} /></button>
              {rightCollapsed && <button className="micro-icon reopen-sidebar" title="Show mission details" onClick={() => setRightCollapsed(false)}><Activity size={15} /></button>}
            </div>
          </div>

          <div className="map-contextline">
            <div className="context-left"><span className="north-marker">N</span><span>SECTOR ALPHA <b>01–04</b></span><span className="context-separator" /><span>{simulation.obstacles.size} ROAD BLOCKS</span></div>
            <div className="context-right"><span className="comm-pulse" /><Signal size={13} /> MESH LINK NOMINAL <span className="context-separator" /> LAST SYNC {formatTime(simulation.elapsed)}</div>
          </div>

          <div className="map-view">
            <div className="map-label map-label--north">N <span>↑</span></div>
            <div className="map-label map-label--west">WEST RESIDENTIAL</div>
            <div className="map-label map-label--east">RIVER DISTRICT</div>
            <div className="map-label map-label--south">SOUTH ACCESS / A-04</div>
            <MapCanvas
              simulation={simulation}
              revision={revision}
              selectedId={selectedId}
              zoom={zoom}
              pan={pan}
              showCoordinates={showCoordinates}
              tool={tool}
              onPan={setPan}
              onMapPoint={handleMapPoint}
              onSelect={setSelectedId}
            />
            {tool !== 'select' && <div className="tool-hint"><Crosshair size={14} /> {tool === 'victim' ? 'SELECT A CLEAR CELL TO REPORT A VICTIM' : 'SELECT A CELL TO BLOCK OR CLEAR IT'} <button title="Cancel map tool" onClick={() => setTool('select')}><X size={13} /></button></div>}
            <div className="map-scale"><span /> 500 M</div>
          </div>

          <div className="map-legend">
            <div className="legend-items">
              <span className="legend-item"><i className="legend-swatch terrain-road" /> ROAD</span>
              <span className="legend-item"><i className="legend-swatch terrain-open" /> OPEN</span>
              <span className="legend-item"><i className="legend-swatch terrain-building" /> STRUCTURE</span>
              <span className="legend-item"><i className="legend-swatch terrain-rubble" /> RUBBLE</span>
              <span className="legend-item"><i className="legend-dot legend-victim" /> VICTIM</span>
              <span className="legend-item"><i className="legend-diamond" /> DRONE</span>
              <span className="legend-item"><i className="legend-pad" /> DRONE PAD</span>
              <span className="legend-item"><i className="legend-square legend-rover" /> ROVER</span>
              <span className="legend-item"><i className="legend-square legend-med" /> AMBULANCE</span>
              <span className="legend-item"><i className="legend-square legend-staging" /> STAGING</span>
              <span className="legend-item"><i className="legend-square legend-charge" /> CHARGER</span>
              <span className="legend-item"><i className="legend-square legend-hospital" /> MEDICAL CENTRE</span>
              <span className="legend-item"><i className="legend-route" /> NAVIGATION</span>
              <span className="legend-item"><i className="legend-cross" /> BLOCKED</span>
            </div>
            <div className="legend-coordinate">GRID CELL = 160 M</div>
          </div>
        </section>

        {!rightCollapsed && <aside className="sidebar sidebar-right">
          <section className="side-section selected-section">
            <div className="section-heading"><span>SELECTED UNIT</span><button className="micro-icon" title="Collapse details sidebar" onClick={() => setRightCollapsed(true)}><Menu size={14} /></button></div>
            {selectedUnit ? <>
              <div className="selected-identity">
                <div className={`selected-unit-icon ${selectedRover ? 'selected-unit-icon--rover' : selectedDrone ? 'selected-unit-icon--drone' : selectedAmbulance ? 'selected-unit-icon--med' : 'selected-unit-icon--victim'}`}>
                  {selectedRover ? <Bot size={20} /> : selectedDrone ? <Crosshair size={19} /> : selectedAmbulance ? <HeartPulse size={19} /> : <Target size={19} />}
                </div>
                <div className="selected-name"><strong>{selectedUnit.id}</strong><small>{selectedRover ? 'AUTONOMOUS GROUND ROVER' : selectedDrone ? 'AERIAL SURVEILLANCE' : selectedAmbulance ? 'MEDICAL TRANSPORT' : 'RESCUE SUBJECT'}</small></div>
                <span className={`unit-status-chip ${'state' in selectedUnit ? `unit-status-chip--${selectedUnit.state}` : ''}`}>{stateLabel('state' in selectedUnit ? selectedUnit.state : selectedVictim?.state ?? 'unknown')}</span>
              </div>
              <div className="detail-grid">
                <div className="detail-cell"><small>GRID POSITION</small><b>{coord(selectedUnit.position)}</b></div>
                <div className="detail-cell"><small>DESTINATION</small><b>{coord(selectedRover?.destination ?? (selectedAmbulance?.state === 'transporting' ? simulation.hospital : selectedAmbulance?.state === 'en-route' ? simulation.victims.find((victim) => victim.id === selectedAmbulance.victimId)?.position : selectedDrone?.patrol[selectedDrone.patrolIndex] ?? selectedVictim?.position))}</b></div>
                <div className="detail-cell detail-cell--wide"><small>ACTIVE ASSIGNMENT</small><b>{selectedTask ? `${selectedTask.id} · ${selectedVictimForTask?.id}` : selectedAmbulance?.victimId ? `PICKUP · ${selectedAmbulance.victimId}` : selectedVictim ? `RESCUE · ${stateLabel(selectedVictim.state)}` : selectedDrone ? 'SECTOR PATROL / AUTONOMOUS' : selectedRover?.state === 'returning' ? 'RETURN TO CHARGER' : selectedRover?.state === 'charging' ? 'BATTERY RECOVERY' : 'NO ACTIVE TASK'}</b></div>
                {selectedRover && <div className="battery-detail detail-cell--wide">
                  <div><small>BATTERY RESERVE</small><b className={selectedRover.battery <= simulation.settings.criticalBatteryThreshold ? 'text-red' : selectedRover.battery <= simulation.settings.lowBatteryThreshold ? 'text-amber' : ''}>{Math.round(selectedRover.battery)}%</b></div>
                  <div className="battery-track"><span style={{ width: `${selectedRover.battery}%`, background: selectedRover.battery <= simulation.settings.criticalBatteryThreshold ? '#ec756a' : selectedRover.battery <= simulation.settings.lowBatteryThreshold ? '#e6bd66' : '#62d5c0' }} /></div>
                </div>}
                <div className="detail-cell"><small>ROUTE DISTANCE</small><b>{selectedRover ? `${selectedRover.route.length} CELLS` : selectedDrone ? `${selectedDrone.coverage.size} CELLS COVERED` : selectedAmbulance ? `${selectedAmbulance.route.length} CELLS` : '—'}</b></div>
                <div className="detail-cell"><small>COORDINATOR LINK</small><b className="link-value"><span className="tiny-dot" /> LINKED</b></div>
              </div>
            </> : <div className="empty-state">Select a unit on the roster or map.</div>}
          </section>

          <section className="side-section metrics-section">
            <div className="section-heading"><span>LIVE PERFORMANCE</span><span className="metrics-live"><Activity size={12} /> LIVE</span></div>
            <div className="metric-rows">
              <div className="metric-row"><span>Tasks completed</span><b>{simulation.metrics.completedTasks}<small> / {simulation.tasks.length}</small></b></div>
              <div className="metric-row"><span>Avg. rover response</span><b>{formatTime(average(simulation.metrics.responseTimes))}</b></div>
              <div className="metric-row"><span>Avg. transport time</span><b>{formatTime(average(simulation.metrics.transportTimes))}</b></div>
              <div className="metric-row"><span>Rover distance</span><b>{simulation.metrics.totalRoverDistance.toFixed(0)}<small> cells</small></b></div>
              <div className="metric-row"><span>Task reassignments</span><b>{simulation.metrics.reassignments}</b></div>
              <div className="metric-row"><span>Blocked moves</span><b>{simulation.metrics.blockedMoves}</b></div>
              <div className="metric-row"><span>Collision events</span><b className={simulation.metrics.collisions ? 'text-red' : ''}>{simulation.metrics.collisions}</b></div>
              <div className="metric-row"><span>Fleet utilization</span><b>{utilization.toFixed(0)}<small>%</small></b></div>
              <div className="metric-row"><span>Avg. rover battery</span><b>{averageBattery.toFixed(0)}<small>%</small></b></div>
              <div className="metric-row"><span>Low-battery events</span><b>{simulation.metrics.lowBatteryEvents}</b></div>
              <div className="metric-row"><span>Tasks remaining</span><b className={remainingTasks ? 'text-amber' : 'text-green'}>{remainingTasks}</b></div>
            </div>
          </section>

          <section className="side-section coordination-section">
            <div className="section-heading"><span>COORDINATION MONITOR</span><span className="monitor-count">{currentAlerts ? `${currentAlerts} ALERT${currentAlerts === 1 ? '' : 'S'}` : 'NOMINAL'}</span></div>
            <div className="coord-status"><span className={`coord-led ${currentAlerts ? 'coord-led--warning' : ''}`} /><span>{currentAlerts ? 'ATTENTION REQUIRED' : 'FLEET NETWORK HEALTHY'}</span><Signal size={13} /></div>
            <div className="coord-events">
              {simulation.events.filter((event) => event.message.includes('assigned') || event.message.includes('reassigned') || event.message.includes('released') || event.kind === 'failure' || (event.kind === 'warning' && event.message.includes('battery'))).slice(0, 4).map((event) => <div key={event.id} className={`coord-event coord-event--${event.kind}`}><span>{formatTime(event.time)}</span><p>{event.message.replace(/^.*? · /, '')}</p></div>)}
              {!simulation.events.some((event) => event.message.includes('assigned')) && <div className="coord-empty">Task delegation messages will appear here.</div>}
            </div>
          </section>

          <section className="side-section baseline-section">
            <div className="section-heading"><span>STRATEGY / BASELINE</span><span className="help-icon" title="Measured repeatable 900-second simulations using the same initial scenario."><CircleHelp size={13} /></span></div>
            <div className="baseline-subtitle">REPEATABLE 900 S RUN · SAME SCENARIO SEED</div>
            {benchmarks ? <div className="benchmark-table">
              <div className="benchmark-row benchmark-row--head"><span>MEASURE</span><b>COORD.</b><b>NEAREST</b></div>
              <div className="benchmark-row"><span>Tasks complete</span><b>{Math.round(benchmarks.coordinated.completionRate * 100)}%</b><b>{Math.round(benchmarks.baseline.completionRate * 100)}%</b></div>
              <div className="benchmark-row"><span>Travel distance</span><b>{benchmarks.coordinated.totalDistance.toFixed(0)}</b><b>{benchmarks.baseline.totalDistance.toFixed(0)}</b></div>
              <div className="benchmark-row"><span>Avg. response</span><b>{formatTime(benchmarks.coordinated.averageResponse)}</b><b>{formatTime(benchmarks.baseline.averageResponse)}</b></div>
              <div className="benchmark-row"><span>Reassignments</span><b>{benchmarks.coordinated.reassignments}</b><b>{benchmarks.baseline.reassignments}</b></div>
              <div className="benchmark-row"><span>Blocked moves</span><b>{benchmarks.coordinated.blockedMoves}</b><b>{benchmarks.baseline.blockedMoves}</b></div>
            </div> : <div className="benchmark-loading"><span className="loader-dot" /> REPLAYING BOTH STRATEGIES…</div>}
            <div className="baseline-note">Local simulation estimates only. No physical robot data.</div>
          </section>
        </aside>}
      </main>

      <footer className="controlbar">
        <div className="transport-controls">
          {!simulation.running ? <button className="control-primary" onClick={handleStart}><Play size={15} fill="currentColor" /> {simulation.elapsed ? 'RESUME' : 'START SIMULATION'}</button> : <button className="control-primary control-primary--pause" onClick={handlePause}><Pause size={15} fill="currentColor" /> PAUSE</button>}
          <button className="control-button control-reset" onClick={resetSimulation} title="Reset simulation"><RotateCcw size={15} /><span>RESET</span></button>
          <span className="control-divider" />
          <button className={`control-button ${tool === 'victim' ? 'control-button--selected' : ''}`} onClick={() => setTool(tool === 'victim' ? 'select' : 'victim')} title="Click a map cell to add a victim"><Plus size={16} /><span>ADD VICTIM</span></button>
          <button className={`control-button ${tool === 'obstacle' ? 'control-button--selected' : ''}`} onClick={() => setTool(tool === 'obstacle' ? 'select' : 'obstacle')} title="Click a map cell to block or reopen it"><AlertTriangle size={15} /><span>ROAD BLOCK</span></button>
          <button className="control-button" onClick={() => { simulation.addUrgentVictim(); forceUpdate(); }} title="Create and dispatch an urgent rescue request"><SirenIcon /><span>URGENT CALL</span></button>
          <span className="control-divider" />
          <button className="control-button control-button--danger" onClick={triggerFailure} title="Fail the selected rover"><ShieldAlert size={15} /><span>FAIL ROVER</span></button>
          <button className="control-button control-button--warning" onClick={triggerBattery} title="Force low battery and return selected rover to charging"><BatteryCharging size={16} /><span>LOW BATTERY</span></button>
        </div>
        <div className="control-status">
          <span className="control-speed-label"><Zap size={12} /> {speed}×</span>
          <span className="control-divider" />
          <span className="control-status-text"><span className="live-dot" /> SIM CLOCK {formatTime(simulation.elapsed)}</span>
          <span className="control-divider" />
          <span className="control-status-text">{remainingTasks} TASKS OPEN</span>
        </div>
      </footer>

      {settingsOpen && <div className="settings-popover">
        <div className="settings-heading"><div><Settings2 size={15} /> SIMULATION PARAMETERS</div><button className="micro-icon" onClick={() => setSettingsOpen(false)} title="Close settings"><X size={14} /></button></div>
        <label className="setting-row"><span>Battery discharge interval</span><div><input type="number" min="4" max="60" value={simulation.settings.secondsPerBatteryPercent} onChange={(event) => updateSetting('secondsPerBatteryPercent', Number(event.target.value))} /><small>sec / 1%</small></div></label>
        <label className="setting-row"><span>Low battery warning</span><div><input type="number" min="25" max="80" value={simulation.settings.lowBatteryThreshold} onChange={(event) => updateSetting('lowBatteryThreshold', Number(event.target.value))} /><small>%</small></div></label>
        <label className="setting-row"><span>Critical return threshold</span><div><input type="number" min="5" max="50" value={simulation.settings.criticalBatteryThreshold} onChange={(event) => updateSetting('criticalBatteryThreshold', Number(event.target.value))} /><small>%</small></div></label>
        <label className="setting-row"><span>Safety reserve</span><div><input type="number" min="0" max="30" value={simulation.settings.safetyReserve} onChange={(event) => updateSetting('safetyReserve', Number(event.target.value))} /><small>%</small></div></label>
        <label className="setting-row"><span>Charge rate</span><div><input type="number" min="0.5" max="10" step="0.5" value={simulation.settings.chargePercentPerSecond} onChange={(event) => updateSetting('chargePercentPerSecond', Number(event.target.value))} /><small>% / sec</small></div></label>
        <label className="setting-row"><span>Rescue service time</span><div><input type="number" min="2" max="60" value={simulation.settings.rescueDuration} onChange={(event) => updateSetting('rescueDuration', Number(event.target.value))} /><small>sec</small></div></label>
        <div className="settings-foot"><Check size={12} /> CHANGES APPLY TO THE ACTIVE RUN</div>
      </div>}
    </div>
  );
}

function SirenIcon() {
  return <AlertTriangle size={15} />;
}

export default App;