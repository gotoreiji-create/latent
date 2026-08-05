import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';

import type { Place } from '../lib/cards';
import { colour, font } from '../lib/theme';

/**
 * SPEC §9 — the readouts.
 *
 * Every one of these is drawn by hand rather than by a chart library, because
 * a chart library's output is recognisable and this app is being judged on not
 * looking like anything else. They share a vocabulary: a hairline baseline,
 * ticks that overshoot it slightly, monospaced labels, and marks in slate
 * green. The blue is spent on the headline figure and never appears here.
 */

const TICK = 4;
const LABEL = 9;

// ---------------------------------------------------------------- Card 1 ----

/** Twelve months, each a column filled from the bottom by its screen share. */
export function MonthBand({
  months,
  width,
}: {
  months: { label: string; ratio: number; count: number }[];
  width: number;
}) {
  const height = 120;
  const labelBand = 16;
  const plot = height - labelBand - TICK;
  const gap = 5;
  const barWidth = (width - gap * (months.length - 1)) / months.length;

  return (
    <Svg width={width} height={height}>
      {months.map((m, i) => {
        const x = i * (barWidth + gap);
        const filled = Math.round(plot * m.ratio);
        return (
          <G key={i}>
            {/* The month's full extent, so an empty month still reads as a
                month rather than as missing. */}
            <Rect
              x={x}
              y={0}
              width={barWidth}
              height={plot}
              fill={colour.veil}
              opacity={m.count === 0 ? 0.35 : 1}
            />
            {filled > 0 && (
              <Rect
                x={x}
                y={plot - filled}
                width={barWidth}
                height={filled}
                fill={colour.mark}
              />
            )}
            <Line
              x1={x + barWidth / 2}
              y1={plot}
              x2={x + barWidth / 2}
              y2={plot + TICK}
              stroke={colour.ink}
              strokeWidth={1}
            />
            <SvgText
              x={x + barWidth / 2}
              y={plot + TICK + LABEL + 2}
              fontFamily={font.dataLight}
              fontSize={LABEL}
              fill={colour.mark}
              textAnchor="middle"
            >
              {m.label}
            </SvgText>
          </G>
        );
      })}
      <Line
        x1={0}
        y1={plot}
        x2={width}
        y2={plot}
        stroke={colour.ink}
        strokeWidth={1}
      />
    </Svg>
  );
}

// ---------------------------------------------------------------- Card 2 ----

/** Twenty-four cells in a row, shaded by how often that hour appears (§6). */
export function HourRuler({
  histogram,
  width,
}: {
  histogram: number[];
  width: number;
}) {
  const height = 76;
  const band = 44;
  const gap = 2;
  const cell = (width - gap * 23) / 24;
  const peak = Math.max(...histogram, 1);
  const marks = [0, 6, 12, 18];

  return (
    <Svg width={width} height={height}>
      {histogram.map((count, h) => (
        <Rect
          key={h}
          x={h * (cell + gap)}
          y={0}
          width={cell}
          height={band}
          fill={colour.mark}
          // Never fully transparent: an hour with nothing in it is a reading,
          // not an absence.
          opacity={0.1 + (count / peak) * 0.9}
        />
      ))}
      <Line
        x1={0}
        y1={band}
        x2={width}
        y2={band}
        stroke={colour.ink}
        strokeWidth={1}
      />
      {marks.map((h) => {
        const x = h * (cell + gap) + cell / 2;
        return (
          <G key={h}>
            <Line
              x1={x}
              y1={band}
              x2={x}
              y2={band + TICK}
              stroke={colour.ink}
              strokeWidth={1}
            />
            <SvgText
              x={x}
              y={band + TICK + LABEL + 3}
              fontFamily={font.dataLight}
              fontSize={LABEL}
              fill={colour.mark}
              textAnchor={h === 0 ? 'start' : 'middle'}
            >
              {h === 0 ? '00' : `${h}`}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ---------------------------------------------------------------- Card 3 ----

/**
 * The places, drawn only in relation to each other.
 *
 * No map, no place name, no coordinate on screen (§6). The graticule is there
 * to say "this is a measurement" without saying where.
 */
export function PlaceField({
  places,
  width,
}: {
  places: Place[];
  width: number;
}) {
  const height = 180;
  if (places.length === 0) return null;

  const lats = places.map((p) => p.lat);
  const lons = places.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const spanLat = maxLat - minLat || 1;
  const spanLon = maxLon - minLon || 1;
  const most = Math.max(...places.map((p) => p.visits));
  const pad = 40;

  return (
    <Svg width={width} height={height}>
      <G opacity={0.5}>
        {[0.25, 0.5, 0.75].map((f) => (
          <Line
            key={`h${f}`}
            x1={0}
            y1={height * f}
            x2={width}
            y2={height * f}
            stroke={colour.veil}
            strokeWidth={1}
          />
        ))}
        {[0.25, 0.5, 0.75].map((f) => (
          <Line
            key={`v${f}`}
            x1={width * f}
            y1={0}
            x2={width * f}
            y2={height}
            stroke={colour.veil}
            strokeWidth={1}
          />
        ))}
      </G>

      {places.map((p, i) => {
        const r = 8 + (p.visits / most) * 22;
        const x =
          places.length === 1
            ? width / 2
            : pad + ((p.lon - minLon) / spanLon) * (width - pad * 2);
        const y =
          places.length === 1
            ? height / 2
            : pad + ((maxLat - p.lat) / spanLat) * (height - pad * 2);
        return (
          <G key={i}>
            <Circle
              cx={x}
              cy={y}
              r={r}
              fill={colour.mark}
              opacity={i === 0 ? 1 : 0.55}
            />
            <SvgText
              x={x}
              y={y + r + LABEL + 4}
              fontFamily={font.dataLight}
              fontSize={LABEL}
              fill={colour.mark}
              textAnchor="middle"
            >
              {p.visits}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}
