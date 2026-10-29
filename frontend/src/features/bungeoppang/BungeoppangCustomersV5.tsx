import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type Group } from 'three';
import { CustomerModelPoolV5, instantiateCustomerV5 } from './customerModelV5';
import { customerAssetV5 } from './customerAssetsV5';
import { customerPoint } from './layoutV5';
import type { CustomerOrder } from './rulesV5';
import { environmentFrame } from '../../world/environmentState';
import { selectBungeoppangCustomer, useBungeoppang } from './store';
import { useCustomerArrivalsV5 } from './customerArrivalV5';
import { CUSTOMER_RECEIVE_MS, CUSTOMER_LEAVE_MS, useCustomerDeparturesV5 } from './customerDepartureV5';
import { advanceCustomerSpeechV5, beginCustomerSpeechV5, endCustomerSpeechV5,
  CUSTOMER_GREETING_MS, customerRequestDuration, moveCustomerCloudV5, useCustomerSpeechV5 } from './customerSpeechV5';

export function BungeoppangCustomersV5({ orders }: { orders: CustomerOrder[] }) {
  const [pool, setPool] = useState<CustomerModelPoolV5 | null>(null);
  const departures = useCustomerDeparturesV5(s => s.visits);
  useEffect(() => {
    const visit = new CustomerModelPoolV5(); setPool(visit);
    return () => visit.dispose();
  }, []);
  if (!pool) return null;
  const visits = new Map(orders.map(order => [order.orderId, order]));
  Object.values(departures).forEach(visit => visits.set(visit.order.orderId, visit.order));
  return <group name="bungeoppang-npc-actors" dispose={null}>
    {[...visits.values()].map(order => <CustomerActor key={order.orderId} pool={pool} orderId={order.orderId} slot={order.customerSlot} items={order.items} />)}
  </group>;
}

function CustomerActor({ pool, orderId, slot, items }: {
  pool: CustomerModelPoolV5; orderId: string; slot: number; items?: CustomerOrder['items'];
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
    beginCustomerSpeechV5(orderId);
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
      endCustomerSpeechV5(orderId);
      actor.current?.dispose(); actor.current = null; lease.release();
    };
  }, [asset, pool, orderId]);
  useFrame((_, delta) => {
    const host = group.current, instance = actor.current;
    if (!host || !instance) return;
    const departure = useCustomerDeparturesV5.getState().visits[orderId];
    if (born.current === null) {
      host.visible = false;
      // Preload during countdown; the visible entrance and greeting start together.
      if (!['play', 'ending'].includes(useBungeoppang.getState().phase)) return;
      if (!departure && useCustomerArrivalsV5.getState().admitted[orderId] === undefined) return;
      born.current = performance.now();
    }
    const age = performance.now() - born.current;
    const departing = departure?.phase === 'leaving';
    const t = departure ? departing ? Math.min(1, Math.max(0,
      (performance.now() - departure.approvedAt - CUSTOMER_RECEIVE_MS - departure.thanksMs) / CUSTOMER_LEAVE_MS)) : 1
      : Math.min(1, age / 1000), base = customerPoint(slot);
    const walking = !reduced.current && (departing || !departure && t < .78);
    const motion = walking ? 'walk' : 'idle';
    host.userData.arrived = !!departure || t === 1;
    host.userData.departurePhase = departure?.phase ?? null;
    instance.play(motion, reduced.current);
    host.userData.motion = motion; host.userData.animationTime = instance.mixer.time;
    host.position.set(base[0] + (reduced.current ? 0 : departing ? t * 1.4 : -(1 - t) * 1.4), base[1] + asset.lift, base[2]);
    {
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
    if (!departure && host.visible) advanceCustomerSpeechV5(orderId, age < CUSTOMER_GREETING_MS ? 'greeting'
      : age < CUSTOMER_GREETING_MS + speechMs ? 'request' : 'summary');
    instance.update(reduced.current ? 0 : delta, environmentFrame.night, opacity);
  });
  return <group ref={group} name={`bungeoppang-customer-${orderId}`}
    position={customerPoint(slot)} visible={false} dispose={null} userData={metadata.current}
    onPointerDown={event => { event.stopPropagation();
      if (!useCustomerDeparturesV5.getState().visits[orderId] && selectBungeoppangCustomer(orderId)) advanceCustomerSpeechV5(orderId, 'summary'); }} />;
}
