import "./style.css";
import { init } from "./webgpu";
import { mat4, vec3 } from "gl-matrix";
import callstackLogo from "./assets/callstack.png";
import basicVertWGSL from './shaders/basicVertWGSL.wgsl?raw';

const [device, context] = await init(document.querySelector("#my-canvas")!);

const canvas: HTMLCanvasElement = document.querySelector("#my-canvas")!;
const aspectRatio = canvas.width / canvas.height;
export const cubeVertexArray = new Float32Array([
  1, -1, 1, 1,
  -1, -1, 1, 1,
  -1, -1, -1, 1,
  1, -1, -1, 1,
  1, -1, 1, 1,
  -1, -1, -1, 1,

  1, 1, 1, 1,
  1, -1, 1, 1,
  1, -1, -1, 1,
  1, 1, -1, 1,
  1, 1, 1, 1,
  1, -1, -1, 1,

  -1, 1, 1, 1,
  1, 1, 1, 1,
  1, 1, -1, 1,
  -1, 1, -1, 1,
  -1, 1, 1, 1,
  1, 1, -1, 1,

  -1, -1, 1, 1,
  -1, 1, 1, 1,
  -1, 1, -1, 1,
  -1, -1, -1, 1,
  -1, -1, 1, 1,
  -1, 1, -1, 1,

  1, 1, 1, 1,
  -1, 1, 1, 1,
  -1, -1, 1, 1,
  -1, -1, 1, 1,
  1, -1, 1, 1,
  1, 1, 1, 1,

  1, -1, -1, 1,
  -1, -1, -1, 1,
  -1, 1, -1, 1,
  1, 1, -1, 1,
  1, -1, -1, 1,
  -1, 1, -1, 1,
]);

// Now draw the rest of the motherf****ing owl.
// Our goal is to create a textured, rotating cube.
// You can use:
// https://webgpu.github.io/webgpu-samples/samples/texturedCube
// https://webgpu.github.io/webgpu-samples/samples/rotatingCube
// for reference.

// There are coordinates of a cube you can shove into vertex buffer.
// You may want to update it with uv coordinates if you want your cube textured.

// If you managed to do it, there can be further challenges:
// 1. How to render multiple cubes? Learn about indexing.
// 2. How to optimize to not render unnecessary vertices?
//    See cull configuration in WebGPU samples, learn about triangle winding and triangle faces.
// 3. Draw a circle in a fragment shader.
//    Use a simple quad (two triangles taking the whole screen) as your canvas.
//    Learn about `step` and `smoothStep` built-in functions in WGSL.
// 4. Implement Phong lighting model and illuminate your cube.
//    See https://learnopengl.com/Lighting/Basic-Lighting and translate it to WebGPU.
// Have fun! :)
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const shader = device.createShaderModule({
  code: basicVertWGSL,
});

const vertisiesBuffer = device.createBuffer({
  size: cubeVertexArray.byteLength,
  usage: GPUBufferUsage.VERTEX,
  mappedAtCreation: true,
});
// And copy it by setting the region of memory mapped for both CPU & GPU.
new Float32Array(vertisiesBuffer.getMappedRange()).set(cubeVertexArray);
// Unlock & unmap the buffer from CPU space. It can be used by GPU now.
vertisiesBuffer.unmap();

const pipeline = device.createRenderPipeline({
  layout: 'auto',
  fragment: {
    module: shader,
    entryPoint: 'fs_main',
    targets: [
      {
        format: presentationFormat,
      },
    ],
  },
  vertex: {
    module: shader,
    entryPoint: 'vs_main',
    buffers: [
      {
        arrayStride: 4 * 10,//totest
        attributes: [
          {
            // position
            shaderLocation: 0,
            offset: 0,
            format: 'float32x4',
          },
          {
            // uv
            shaderLocation: 1,
            offset: 4 * 8,//totest
            format: 'float32x2',
          },
        ],
      },
    ],
  },
  primitive: {
    topology: 'triangle-list',

    // Backface culling since the cube is solid piece of geometry.
    // Faces pointing away from the camera will be occluded by faces
    // pointing toward the camera.
    cullMode: 'back', //totest
  },

  // Enable depth testing so that the fragment closest to the camera
  // is rendered in front.
  // depthStencil: {
  //   depthWriteEnabled: true,
  //   depthCompare: 'less',
  //   format: 'depth24plus',
  // },
});

const projectionMat = mat4.create();
// This creates a perspective projection (so stuff farther away is smaller).
// See: https://www.scratchapixel.com/lessons/3d-basic-rendering/perspective-and-orthographic-projection-matrix/building-basic-perspective-projection-matrix.html
// for details.
mat4.perspective(projectionMat, (2 * Math.PI) / 5, aspectRatio, 1.0, 100.0);

function transformationMatrix(t: number): Float32Array {
  const viewMat = mat4.create();
  // Move model coordinates (x, y, 1.0) farther from the camera.
  mat4.translate(viewMat, viewMat, vec3.fromValues(0, 0, -4));

  // Rotate every frame around the Z axis, so x & y will change and z will remain unchanged.
  mat4.rotateZ(viewMat, viewMat, t);

  const cameraMat = mat4.create();
  mat4.multiply(cameraMat, projectionMat, viewMat);
  return cameraMat as Float32Array;
}

const cameraUniformBuffer = device.createBuffer({
  // 4 * 16 = 4 * 4 = 16 and float is 4 bytes each.
  size: 4 * 16,
  // We want to copy to this buffer from our CPU,
  // and it'll be used as uniform buffer in the pipeline.
  usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
});

let logoTexture: GPUTexture;
{
  // Create in-memory image, decode it to image bitmap and copy to GPU.
  const img = document.createElement("img");
  img.src = new URL(callstackLogo, import.meta.url).toString();
  await img.decode();
  const imageBitmap = await createImageBitmap(img);

  logoTexture = device.createTexture({
    size: [imageBitmap.width, imageBitmap.height, 1],
    format: "rgba8unorm",
    usage:
      // We want to bind this texture in our shader.
      GPUTextureUsage.TEXTURE_BINDING |
      // We want to copy from it.
      GPUTextureUsage.COPY_DST |
      // I don't know why we need it - it's used when it's an output texture.
      // It is not :).
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture(
    { source: imageBitmap },
    { texture: logoTexture },
    [imageBitmap.width, imageBitmap.height]
  );
}

// Sampler is a way of taking color from textures. It defines how we "sample" texture.
// magFilter and minFilter are strategies used when texture size is not aligned with
// our viewport size - it defines how color should be sampled from multiple pixels of
// textures.
const textureSampler = device.createSampler({
  magFilter: "linear",
  minFilter: "linear",
});

// In order to define how we pass data to shaders, we use bind groups.
// Bind groups define how data is lay out and how to access it
// from perspective of shader.
const bindGroup = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [
    {
      binding: 0,
      resource: {
        buffer: cameraUniformBuffer,
      },
    },
    {
      binding: 1,
      resource: textureSampler,
    },
    {
      binding: 2,
      resource: logoTexture.createView(),
    },
  ],
});

const renderFrame = () => {
  const view = context.getCurrentTexture().createView();
  const encoder = device.createCommandEncoder();
  // Get our transformation matrix.
  const tMat = transformationMatrix(Date.now() / 1000.0);

  // Move our buffer data to GPU.
  device.queue.writeBuffer(
    cameraUniformBuffer,
    0,
    tMat.buffer,
    tMat.byteOffset,
    tMat.byteLength
  );

  const renderPass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view,
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  });
  renderPass.setPipeline(pipeline);
  // We need to set bind group we've created to use in shaders.
  renderPass.setBindGroup(0, bindGroup);
  // We need to set the vertex buffer as well.
  renderPass.setVertexBuffer(0, vertisiesBuffer);
  renderPass.draw(14, 1, 0, 0);
  renderPass.end();
  device.queue.submit([encoder.finish()]);
  requestAnimationFrame(renderFrame);
};

requestAnimationFrame(renderFrame);


