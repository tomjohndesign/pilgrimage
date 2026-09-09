/** Serialized into the existing /play benchmark page by Playwright. This probes
 * a real WGSL compute pipeline on captured character anchors; it does not replace
 * the WebGL renderer. All setup, packing, readback and precision costs are explicit.
 * Timestamp usage follows https://webgpu.github.io/webgpu-samples/?sample=timestampQuery.
 */
export async function probeCharacterCompute({ anchors, view }) {
  if (!navigator.gpu) return { supported: false, reason: "navigator.gpu unavailable", secureContext: isSecureContext }
  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) return { supported: false, reason: "No WebGPU adapter" }
  const count = anchors.length / 4
  if (!Number.isInteger(count) || count < 1 || count > 16384 || view.length !== 16) throw new Error("Expected 1–16384 actual character anchors and a view matrix")
  const timestamp = adapter.features.has("timestamp-query")
  const setupStart = performance.now()
  const device = await adapter.requestDevice({ requiredFeatures: timestamp ? ["timestamp-query"] : [] })
  const resources = [], errors = []
  device.addEventListener("uncapturederror", event => errors.push(event.error.message))
  const buffer = (size, usage) => {
    const result = device.createBuffer({ size, usage }); resources.push(result); return result
  }
  let query
  try {
    const bytes = count * 16, input = buffer(bytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST)
    const output = buffer(bytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC)
    const uniforms = buffer(64, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)
    const readback = buffer(bytes, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST)
    const queryResolve = timestamp ? buffer(16, GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC) : null
    const queryRead = timestamp ? buffer(16, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST) : null
    if (timestamp) query = device.createQuerySet({ type: "timestamp", count: 2 })
    const shader = device.createShaderModule({ code: `
      @group(0) @binding(0) var<storage, read> anchors: array<vec4<f32>>;
      @group(0) @binding(1) var<storage, read_write> result: array<vec4<f32>>;
      @group(0) @binding(2) var<uniform> view: mat4x4<f32>;
      @compute @workgroup_size(64)
      fn main(@builtin(global_invocation_id) invocation: vec3<u32>) {
        let i = invocation.x;
        if (i < arrayLength(&anchors)) { result[i] = view * anchors[i]; }
      }` })
    const compilation = await shader.getCompilationInfo()
    if (compilation.messages.some(message => message.type === "error")) throw new Error(compilation.messages.map(message => message.message).join("\n"))
    const pipeline = await device.createComputePipelineAsync({ layout: "auto", compute: { module: shader, entryPoint: "main" } })
    const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [input, output, uniforms].map((value, binding) => ({ binding, resource: { buffer: value } })) })
    const packed = new Float32Array(anchors.length), packedView = new Float32Array(16)
    const expected = new Float32Array(anchors.length)
    // Same JS-number multiply/add ordering as CharacterBatch.write, followed by
    // Float32 storage. This is the current CPU result, not a float-only oracle.
    const cpu = () => {
      for (let i = 0; i < anchors.length; i += 4) {
        const x = anchors[i], y = anchors[i + 1], z = anchors[i + 2], w = anchors[i + 3]
        for (let row = 0; row < 4; row++) expected[i + row] = view[row] * x + view[row + 4] * y + view[row + 8] * z + view[row + 12] * w
      }
    }
    const setupMs = performance.now() - setupStart
    const cpuMs = [], roundTripMs = [], gpuMs = []
    let actual
    for (let iteration = 0; iteration < 25; iteration++) {
      // Amortize the browser timer resolution. Avoid a single sub-ms sample.
      const cpuStart = performance.now()
      for (let repeat = 0; repeat < 50; repeat++) cpu()
      const cpuElapsed = (performance.now() - cpuStart) / 50
      const start = performance.now()
      packed.set(anchors); packedView.set(view)
      device.queue.writeBuffer(input, 0, packed); device.queue.writeBuffer(uniforms, 0, packedView)
      const encoder = device.createCommandEncoder()
      const pass = encoder.beginComputePass(query ? { timestampWrites: { querySet: query, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : {})
      pass.setPipeline(pipeline); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(Math.ceil(count / 64)); pass.end()
      encoder.copyBufferToBuffer(output, 0, readback, 0, bytes)
      if (query) {
        encoder.resolveQuerySet(query, 0, 2, queryResolve, 0)
        encoder.copyBufferToBuffer(queryResolve, 0, queryRead, 0, 16)
      }
      device.queue.submit([encoder.finish()])
      await readback.mapAsync(GPUMapMode.READ)
      actual = new Float32Array(readback.getMappedRange()).slice()
      readback.unmap()
      const elapsed = performance.now() - start
      let kernelMs
      if (queryRead) {
        await queryRead.mapAsync(GPUMapMode.READ)
        const times = new BigUint64Array(queryRead.getMappedRange())
        kernelMs = Number(times[1] - times[0]) / 1e6
        queryRead.unmap()
      }
      if (iteration >= 5) { cpuMs.push(cpuElapsed); roundTripMs.push(elapsed); if (kernelMs !== undefined) gpuMs.push(kernelMs) }
    }
    let mismatchedComponents = 0, maxAbsoluteError = 0
    for (let i = 0; i < expected.length; i++) {
      if (!Number.isFinite(actual[i])) throw new Error("Non-finite compute output")
      if (expected[i] !== actual[i]) mismatchedComponents++
      maxAbsoluteError = Math.max(maxAbsoluteError, Math.abs(expected[i] - actual[i]))
    }
    if (errors.length) throw new Error(errors.join("\n"))
    const summarize = values => {
      if (!values.length) return null
      const sorted = [...values].sort((a, b) => a - b)
      return { samples: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length,
        median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor(sorted.length * .95)] }
    }
    return { supported: true, backend: "native WebGPU compute; scene still WebGL", adapter: {
      vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device, description: adapter.info.description,
    }, count, setupMs, timestamp, cpuMs: summarize(cpuMs), gpuKernelMs: summarize(gpuMs), roundTripMs: summarize(roundTripMs),
    uploadedBytes: bytes + 64, readbackBytes: bytes, mismatchedComponents, maxAbsoluteError,
    limitation: "Captured scene anchors; rendering continues. Round trip includes packing/upload/dispatch/readback, but excludes WebGL re-upload. Kernel timings do not predict game FPS." }
  } finally {
    query?.destroy(); resources.forEach(resource => resource.destroy()); device.destroy()
  }
}
