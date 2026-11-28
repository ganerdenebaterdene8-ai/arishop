import React from 'react';
import { Composition } from 'remotion';
import { Daily, DailyProps } from './Daily';

const defaults: DailyProps = {
  image: 'product.jpg',
  name: 'Anua Heartleaf 77 тоник',
  price: 68000,
  hook: 'Солонгост хамгийн их зарагдаж буй',
  category: 'ГОО САЙХАН',
  delivery: '7–14 хоногт хүргэнэ',
  site: 'arishopkorea.mn',
};

export const Root: React.FC = () => (
  <Composition
    id="Daily"
    component={Daily}
    durationInFrames={450}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={defaults}
  />
);
