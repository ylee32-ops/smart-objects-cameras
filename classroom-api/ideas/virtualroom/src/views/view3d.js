export class View3D {
  constructor({ renderer, scene, camera, orbit }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.orbit = orbit;
    this.enabled = true;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.renderer.domElement.hidden = !enabled;
    this.orbit.enabled = enabled;
  }

  resize(width, height) {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  render() {
    if (!this.enabled) return;
    this.orbit.update();
    this.renderer.render(this.scene, this.camera);
  }
}
