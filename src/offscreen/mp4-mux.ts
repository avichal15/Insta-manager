import { createFile, type ISOFile, type Movie, type Sample, type Track } from 'mp4box';
type TrackOptions = NonNullable<Parameters<ISOFile['addTrack']>[0]>;

type ParsedTrack = { file: ISOFile; track: Track; samples: Sample[] };
const endTime = (samples: Sample[]) => samples.reduce((end, sample) => Math.max(end, sample.dts + sample.duration), 0);

function sampleDescription(sample: Sample) {
  const description = sample.description;
  if (!('type' in description) || !('boxes' in description)) throw new Error('Invalid MP4 sample description.');
  return description;
}

function readTrack(buffer: ArrayBuffer, kind: 'video' | 'audio'): ParsedTrack {
  const file = createFile();
  let info: Movie | undefined;
  const samples: Sample[] = [];
  file.onError = () => { throw new Error('The media contains an invalid MP4 stream.'); };
  file.onReady = (movie) => {
    info = movie;
    const track = movie.tracks.find((candidate) => kind === 'video' ? candidate.video : candidate.audio);
    if (!track) throw new Error(`The ${kind} stream does not contain a ${kind} track.`);
    file.setExtractionOptions(track.id, undefined, { nbSamples: 500 });
    file.start();
  };
  file.onSamples = (_id, _user, extracted) => { samples.push(...extracted); };
  file.appendBuffer(Object.assign(buffer, { fileStart: 0 }));
  file.flush();
  const track = info?.tracks.find((candidate) => kind === 'video' ? candidate.video : candidate.audio);
  if (!track || !samples.length || samples.some((sample) => !sample.data?.byteLength)) {
    throw new Error(`The ${kind} stream is empty or incomplete.`);
  }
  if (samples.length !== file.getTrackById(track.id).samples.length) {
    throw new Error(`The ${kind} stream is truncated.`);
  }
  if (samples.some((sample) => !['avc1', 'avc3', 'hvc1', 'hev1', 'av01', 'vp09', 'mp4a', 'Opus'].includes(sampleDescription(sample).type))) {
    throw new Error('This media codec is not supported for local merging.');
  }
  return { file, track, samples };
}

/** Repackages encoded samples without re-encoding or uploading either stream. */
export function muxMp4(videoBuffer: ArrayBuffer, audioBuffer: ArrayBuffer): ArrayBuffer {
  const tracks = [readTrack(videoBuffer, 'video'), readTrack(audioBuffer, 'audio')];
  const output = createFile();
  const movieTimescale = 1000;
  const durationMs = Math.ceil(Math.max(...tracks.map(({ samples, track }) =>
    endTime(samples) / track.timescale * movieTimescale)));
  output.init({ timescale: movieTimescale, duration: durationMs, brands: ['isom', 'iso6', 'mp41'] });
  const mergedSamples: { trackId: number; sample: Sample; timescale: number }[] = [];

  tracks.forEach(({ file, track, samples }, index) => {
    const sourceTrack = file.getTrackById(track.id);
    const firstDescription = sampleDescription(samples[0]);
    if (samples.some((sample) => sample.description_index !== samples[0].description_index)) {
      throw new Error('This stream changes codec configuration and cannot be safely merged.');
    }
    const trackId = output.addTrack({
      id: index + 1,
      type: firstDescription.type as TrackOptions['type'],
      hdlr: track.video ? 'vide' : 'soun',
      timescale: track.timescale,
      duration: durationMs,
      media_duration: endTime(samples),
      width: track.video?.width,
      height: track.video?.height,
      channel_count: track.audio?.channel_count,
      samplerate: track.audio?.sample_rate,
      samplesize: track.audio?.sample_size,
      language: track.language,
      description_boxes: firstDescription.boxes as TrackOptions['description_boxes'],
    });
    if (!trackId) throw new Error('The media track could not be created.');
    const destination = output.getTrackById(trackId);
    // Preserve rotation and edit timing (including AAC priming) from each input.
    destination.tkhd.matrix = new Int32Array(sourceTrack.tkhd.matrix);
    if (sourceTrack.edts) {
      const sourceMovieScale = file.moov.mvhd.timescale;
      for (const entry of sourceTrack.edts.elst?.entries ?? []) {
        entry.segment_duration = Math.round(entry.segment_duration / sourceMovieScale * movieTimescale);
      }
      destination.addBox(sourceTrack.edts);
    }
    for (const sample of samples) mergedSamples.push({ trackId, sample, timescale: track.timescale });
  });

  mergedSamples.sort((a, b) => a.sample.dts / a.timescale - b.sample.dts / b.timescale);
  for (const { trackId, sample } of mergedSamples) {
    output.addSample(trackId, sample.data!, {
      duration: sample.duration, dts: sample.dts, cts: sample.cts, is_sync: sample.is_sync,
      is_leading: sample.is_leading, depends_on: sample.depends_on,
      is_depended_on: sample.is_depended_on, has_redundancy: sample.has_redundancy,
    });
  }
  const stream = output.getBuffer();
  return stream.buffer;
}
