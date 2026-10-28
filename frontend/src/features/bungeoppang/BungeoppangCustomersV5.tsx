import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type Group } from 'three';
import { CustomerModelPoolV5, instantiateCustomerV5 } from './customerModelV5';
import { customerAssetV5 } from './customerAssetsV5';
import { customerPoint } from './layoutV5';
import type { CustomerOrder } from './rulesV5';
import type { BungFeedback } from './presentation';
import { environmentFrame } from '../../world/environmentState';
import { selectBungeoppangCustomer, useBungeoppang } from './store';
import { useCustomerArrivalsV5 } from './customerArrivalV5';
import { advanceCustomerSpeechV5, beginCustomerSpeechV5, endCustomerSpeechV5,
  CUSTOMER_GREETING_MS, customerRequestDuration, moveCustomerCloudV5, useCustomerSpeechV5 } from './customerSpeechV5';

export function BungeoppangCustomersV5({ orders, feedback }: { orders: CustomerOrder[]; feedback: BungFeedback[] }) {
  const [pool, setPool] = useState<CustomerModelPoolV5 | null>(null);
  useEffect(() => {
    const visit = new CustomerModelPoolV5(); setPool(visit);
    return () => visit.dispose();
  }, []);
  if (!pool) return null;
  const departures = feedback.filter((item, index) => item.kind === 'deliver' && item.guestOrderId !== undefined
    && !feedback.slice(0, index).some(other => other.kind === 'deliver' && other.guestOrderId === item.guestOrderId));
  return <group name="bungeoppang-npc-actors" dispose={null}>
    {orders.map(order => <CustomerActor key={order.orderId} pool={pool} orderId={order.orderId} slot={order.customerSlot} items={order.items} />)}
    {departures.map(item => <CustomerActor key={`depart-${item.guestOrderId}`} pool={pool} orderId={item.guestOrderId!} slot={item.guestIndex!} departing />)}
  </group>;
}

function CustomerActor({ pool, orderId, slot, items, departing = false }: {
  pool: CustomerModelPoolV5; orderId: string; slot: number; items?: CustomerOrder['items']; departing?: boolean;
}) {
  const group = useRef<Group>(null), actor = useRef<ReturnType<typeof instantiateCustomerV5> | null>(null);
  const born = useRef<number | null>(null), reduced = useRef(false);
  const { camera, gl } = useThree();
  const projection = useMemo(() => ({ current: new Vector3(), destination: new Vector3() }), []);
  const asset = customerAssetV5(orderId);
  const request = useCustomerSpeechV5(s => s.dialogues[orderId]?.request);
  const speechMs = items ? customerRequestDuration(items, request) : 3000;
  const metadata = useRef({ orderId, lookId: asset.id, loaded: false });
  useEffect(() => {
    const host = group.current!;
    let active = true;
    if (!departing) beginCustomerSpeechV5(orderId);
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => { reduced.current = media.matches; };
    changed(); media.addEventListener('change', changed);
    const lease = pool.acquire(asset);
    void lease.ready.then(source => {
      if (!active) return;
      const instance = instantiateCustomerV5(source, asset);
      actor.current = instance; host.add(instance.root); born.current = null;
      host.userData.loaded = true;
    }).catch((error: unknown) => {
      if (active) {
        host.userData.loadError = String(error);
        console.error('붕어빵 손님 모델을 불러오지 못했습니다.', error);
      }
    });
    return () => {
      active = false; media.removeEventListener('change', changed);
      if (!departing) endCustomerSpeechV5(orderId);
      actor.current?.dispose(); actor.current = null; lease.release();
    };
  }, [asset, pool, orderId, departing]);
  useFrame((_, delta) => {
    const host = group.current, instance = actor.current;
    if (!host || !instance) return;
    if (born.current === null) {
      host.visible = false;
      // Preload during countdown; the visible entrance and greeting start together.
      if (!['play', 'ending'].includes(useBungeoppang.getState().phase)) return;
      if (!departing && useCustomerArrivalsV5.getState().admitted[orderId] === undefined) return;
      born.current = performance.now();
    }
    const age = performance.now() - born.current;
    const t = Math.min(1, age / (departing ? 1100 : 1000)), base = customerPoint(slot);
    const walking = !reduced.current && (departing || t < .78);
    const motion = walking ? 'walk' : 'idle';
    host.userData.arrived = t === 1;
    instance.play(motion, reduced.current);
    host.userData.motion = motion; host.userData.animationTime = instance.mixer.time;
    host.position.set(base[0] + (reduced.current ? 0 : departing ? t * 1.4 : -(1 - t) * 1.4), base[1] + asset.lift, base[2]);
    if (!departing) {
      const headY = host.position.y + asset.height - .2;
      projection.current.set(host.position.x, headY, host.position.z).project(camera);
      projection.destination.set(base[0], headY, base[2]).project(camera);
      const rect = gl.domElement.getBoundingClientRect();
      moveCustomerCloudV5(orderId, (projection.current.x - projection.destination.x) * rect.width / 2,
        -(projection.current.y - projection.destination.y) * rect.height / 2);
    }
    host.rotation.y = reduced.current ? 0 : departing ? Math.PI / 2 : Math.PI / 2 * Math.max(0, 1 - t / .85);
    const opacity = departing ? 1 - Math.max(0, (t - .65) / .35) : reduced.current ? 1 : Math.min(1, t * 5);
    host.visible = opacity > 0;
    if (!departing && host.visible) advanceCustomerSpeechV5(orderId, age < CUSTOMER_GREETING_MS ? 'greeting'
      : age < CUSTOMER_GREETING_MS + speechMs ? 'request' : 'summary');
    instance.update(reduced.current ? 0 : delta, environmentFrame.night, opacity);
  });
  return <group ref={group} name={departing ? `bungeoppang-departing-${orderId}` : `bungeoppang-customer-${orderId}`}
    position={customerPoint(slot)} visible={false} dispose={null} userData={metadata.current}
    onPointerDown={departing ? undefined : event => { event.stopPropagation(); if (selectBungeoppangCustomer(orderId)) advanceCustomerSpeechV5(orderId, 'summary'); }} />;
}
