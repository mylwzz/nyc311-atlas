export function mean(values: readonly number[]): number {
  if (values.length === 0) {
    throw new RangeError("Cannot calculate a mean for an empty array.");
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function quantile(values: readonly number[], probability: number): number {
  if (values.length === 0) {
    throw new RangeError("Cannot calculate a quantile for an empty array.");
  }
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RangeError("Quantile probability must be from 0 through 1.");
  }

  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const fraction = position - lowerIndex;
  return (
    sorted[lowerIndex] + fraction * (sorted[upperIndex] - sorted[lowerIndex])
  );
}

export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

export function selectIndices(
  values: readonly number[],
  indices: readonly number[],
): readonly number[] {
  const observed = new Set<number>();
  return indices.map((index) => {
    if (!Number.isInteger(index) || index < 0 || index >= values.length) {
      throw new RangeError(`Array index ${index} is outside the source array.`);
    }
    if (observed.has(index)) {
      throw new Error(`Duplicate array index: ${index}`);
    }
    observed.add(index);
    return values[index];
  });
}
