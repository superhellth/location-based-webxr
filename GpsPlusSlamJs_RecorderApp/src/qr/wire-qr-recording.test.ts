/**
 * Tests for the QR recording wiring (WS-2 producer + WS-5 consumer composition).
 *
 * Why this matters: this module is where the load-bearing decisions land — the
 * producer's clock MUST be performance.now() (open topic A: epoch ms would
 * silently mis-pair the depth as-of join), the camera-frame source carries the
 * configured cadence + capture size, detections dispatch RAW into the current
 * store, and the debug viz follows the store. The framework producer/controller
 * are mocked (covered by their own tests); these tests isolate the wiring.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  mockCreateQrDetectionController,
  mockCreateBarcodeDetectorFrontEnd,
  capturedProducerDeps,
  fakeProducer,
} = vi.hoisted(() => {
  const fakeProducer = { offerFrame: vi.fn(), reset: vi.fn(), status: 'idle' };
  const capturedProducerDeps: { current: Record<string, unknown> | null } = {
    current: null,
  };
  return {
    fakeProducer,
    capturedProducerDeps,
    mockCreateQrDetectionController: vi.fn((deps: Record<string, unknown>) => {
      capturedProducerDeps.current = deps;
      return fakeProducer;
    }),
    mockCreateBarcodeDetectorFrontEnd: vi.fn(() => ({
      detect: vi.fn().mockResolvedValue(null),
    })),
  };
});

const { mockStartCapture, mockStopCapture } = vi.hoisted(() => ({
  mockStartCapture: vi.fn(),
  mockStopCapture: vi.fn(),
}));

const { mockDebugController, mockCreateQrDebugController } = vi.hoisted(() => {
  const mockDebugController = { update: vi.fn(), dispose: vi.fn() };
  return {
    mockDebugController,
    mockCreateQrDebugController: vi.fn(() => mockDebugController),
  };
});

vi.mock('gps-plus-slam-app-framework/ar/qr-detection-controller', () => ({
  createQrDetectionController: mockCreateQrDetectionController,
}));
vi.mock('gps-plus-slam-app-framework/ar/qr-frontend', () => ({
  createBarcodeDetectorFrontEnd: mockCreateBarcodeDetectorFrontEnd,
}));
vi.mock('gps-plus-slam-app-framework/ar/webxr-session', () => ({
  startCameraFrameCapture: mockStartCapture,
  stopCameraFrameCapture: mockStopCapture,
}));
vi.mock('./qr-debug-controller', () => ({
  createQrDebugController: mockCreateQrDebugController,
}));
vi.mock('../state/recorder-store', () => ({
  recordQrDetection: vi.fn((entry: unknown) => ({
    type: 'qrDetected/recordQrDetection',
    payload: entry,
  })),
}));

import { wireQrRecording } from './wire-qr-recording';

// --- A fake store + storeRef ------------------------------------------------

interface FakeStore {
  getState: () => {
    recording: { latestDepthSample: unknown };
    qrDetected: { maxHistory: number; markers: Record<string, unknown> };
  };
  dispatch: ReturnType<typeof vi.fn>;
  subscribe: (listener: () => void) => () => void;
  emit: () => void;
}

function makeStore(latestDepthSample: unknown = null): FakeStore {
  const listeners = new Set<() => void>();
  return {
    getState: () => ({
      recording: { latestDepthSample },
      qrDetected: { maxHistory: 100, markers: {} },
    }),
    dispatch: vi.fn(),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit: () => {
      for (const l of [...listeners]) l();
    },
  };
}

function makeStoreRef(store: FakeStore) {
  const swapListeners = new Set<(s: FakeStore) => void>();
  let current = store;
  return {
    ref: {
      get: () => current,
      set: (s: FakeStore) => {
        current = s;
        for (const l of [...swapListeners]) l(s);
      },
      subscribe: (l: (s: FakeStore) => void) => {
        swapListeners.add(l);
        return () => swapListeners.delete(l);
      },
    },
  };
}

const qr = { enabled: true, intervalMs: 125, captureSize: 1024 };

describe('wireQrRecording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProducerDeps.current = null;
  });

  it('creates the producer with a performance.now() clock, NOT epoch ms (open topic A)', () => {
    const store = makeStore();
    const { ref } = makeStoreRef(store);
    wireQrRecording({
      storeRef: ref as never,
      getArWorldGroup: () => null,
      qr,
      setProducer: vi.fn(),
    });

    const deps = capturedProducerDeps.current!;
    expect(deps).toBeTruthy();
    const now = deps.now as () => number;
    // performance.now() is a small relative value; Date.now() is ~1.7e12. The
    // join against the depth stream (performance.now) breaks if this is epoch.
    expect(now()).toBeLessThan(1e12);
    // The frame source is the single cadence owner.
    expect(deps.minIntervalMs).toBe(0);
  });

  it('starts camera-frame capture with the configured cadence + capture size', () => {
    const { ref } = makeStoreRef(makeStore());
    wireQrRecording({
      storeRef: ref as never,
      getArWorldGroup: () => null,
      qr,
      setProducer: vi.fn(),
    });
    expect(mockStartCapture).toHaveBeenCalledWith({
      intervalMs: 125,
      captureSize: 1024,
    });
  });

  it('hands the created producer to setProducer (for the pre-initAR frame callback)', () => {
    const setProducer = vi.fn();
    const { ref } = makeStoreRef(makeStore());
    wireQrRecording({
      storeRef: ref as never,
      getArWorldGroup: () => null,
      qr,
      setProducer,
    });
    expect(setProducer).toHaveBeenCalledWith(fakeProducer);
  });

  it('reads camera pose + projection from the latest depth sample', () => {
    const sample = {
      timestamp: 5,
      cameraPos: [1, 2, 3],
      cameraRot: [0, 0, 0, 1],
      points: [],
      projectionMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    };
    const { ref } = makeStoreRef(makeStore(sample));
    wireQrRecording({
      storeRef: ref as never,
      getArWorldGroup: () => null,
      qr,
      setProducer: vi.fn(),
    });
    const deps = capturedProducerDeps.current!;
    expect((deps.getCameraPose as () => unknown)()).toEqual({
      position: [1, 2, 3],
      rotation: [0, 0, 0, 1],
    });
    expect((deps.getProjectionMatrix as () => unknown)()).toBe(
      sample.projectionMatrix
    );
  });

  it('dispatches RAW recordQrDetection into the CURRENT store', () => {
    const store = makeStore();
    const { ref } = makeStoreRef(store);
    wireQrRecording({
      storeRef: ref as never,
      getArWorldGroup: () => null,
      qr,
      setProducer: vi.fn(),
    });
    const deps = capturedProducerDeps.current!;
    const observation = { text: 'x', timestamp: 1 };
    (deps.recordDetection as (o: unknown) => void)(observation);
    expect(store.dispatch).toHaveBeenCalledWith({
      type: 'qrDetected/recordQrDetection',
      payload: observation,
    });
  });

  it('drives the debug controller on store change and re-attaches across a swap', () => {
    const store = makeStore();
    const { ref } = makeStoreRef(store);
    wireQrRecording({
      storeRef: ref as never,
      getArWorldGroup: () => null,
      qr,
      setProducer: vi.fn(),
    });
    // Initial update on wire.
    expect(mockDebugController.update).toHaveBeenCalledTimes(1);

    store.emit(); // a store change → update
    expect(mockDebugController.update).toHaveBeenCalledTimes(2);

    const store2 = makeStore();
    ref.set(store2); // Start Recording / replay swap → re-attach + update
    expect(mockDebugController.update).toHaveBeenCalledTimes(3);
    store2.emit(); // new store change drives the controller
    expect(mockDebugController.update).toHaveBeenCalledTimes(4);
  });

  it('dispose() stops capture, resets the producer, clears it, and disposes the viz', () => {
    const setProducer = vi.fn();
    const { ref } = makeStoreRef(makeStore());
    const dispose = wireQrRecording({
      storeRef: ref as never,
      getArWorldGroup: () => null,
      qr,
      setProducer,
    });

    dispose();
    expect(mockStopCapture).toHaveBeenCalledTimes(1);
    expect(fakeProducer.reset).toHaveBeenCalledTimes(1);
    expect(setProducer).toHaveBeenLastCalledWith(null);
    expect(mockDebugController.dispose).toHaveBeenCalledTimes(1);
  });
});
