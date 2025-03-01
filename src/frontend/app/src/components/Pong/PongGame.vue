<template>
  <div v-if="isSpecialMode" class="hotkeys">
    <p>Hotkeys : speed-up: [Q], grow: [R], shrink: [F]</p>
  </div>
  <div class="text-center">
    <h2 class="p1-score inline">{{ playerOneScore }}</h2>
    <h2 class="inline">:</h2>
    <h2 class="inline p2-score">{{ playerTwoScore }}</h2>
  </div>
  <div class="game-bg">
    <canvas class="game" ref="game" width="600" height="480"> </canvas>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import type { Ball, GameState, PongBar } from "./PongTypes";
import { mapState } from "pinia";
import { useSocketStore } from "@/stores/SocketStore";

interface PressedKeys {
  w: boolean;
  s: boolean;
  ArrowUp: boolean;
  ArrowDown: boolean;
  q: boolean;
  r: boolean;
  f: boolean;
}

interface DataObject {
  context: CanvasRenderingContext2D | null;
  playerOneScore: number;
  playerTwoScore: number;
  pressedKeys: PressedKeys;
  isSpecialMode: boolean;
}

export default defineComponent({
  props: {
    observing: Boolean,
  },
  data(): DataObject {
    return {
      context: null,
      playerOneScore: 0,
      playerTwoScore: 0,
      pressedKeys: {
        w: false,
        s: false,
        ArrowUp: false,
        ArrowDown: false,
        q: false,
        r: false,
        f: false,
      },
      isSpecialMode: true,
    };
  },
  computed: {
    width() {
      return (this.$refs as any).game.width;
    },
    height() {
      return (this.$refs as any).game.height;
    },
    ...mapState(useSocketStore, {
      socket: "pong",
    }),
  },
  methods: {
    updatePlayer(data: GameState) {
      this.updateObserver(data);
    },

    updateObserver(data: GameState) {
      this.render(data);
      this.isSpecialMode = !data.default;
      this.playerOneScore = data.playerOne.score;
      this.playerTwoScore = data.playerTwo.score;
    },

    render(data: GameState) {
      this.clear();
      this.drawBar(data.playerOne.bar);
      this.drawBar(data.playerTwo.bar);
      this.drawBall(data.ball);
    },

    drawBar(bar: PongBar) {
      this.context!.fillStyle = "#ff80fd";
      this.context!.fillRect(
        bar.position.x * this.width,
        bar.position.y * this.height,
        bar.width * this.width,
        bar.height * this.height
      );
    },

    drawBall(ball: Ball) {
      this.context!.beginPath();
      this.context!.fillStyle = "#ffe32e";
      this.context!.arc(
        ball.position.x * this.width,
        ball.position.y * this.height,
        ball.radius * this.width,
        0,
        2 * Math.PI
      );
      this.context!.fill();
    },

    keyDown(data: any) {
      if (this.pressedKeys[data.key] !== undefined) {
        this.pressedKeys[data.key] = true;
      }
    },

    keyUp(data: any) {
      if (this.pressedKeys[data.key] !== undefined) {
        this.pressedKeys[data.key] = false;
      }
    },

    releaseKeys() {
      for (let key in this.pressedKeys) {
        this.pressedKeys[key] = false;
      }
    },

    clear() {
      this.context!.clearRect(0, 0, this.width, this.height);
    },
  },

  watch: {
    pressedKeys: {
      deep: true,
      handler() {
        this.socket!.emit("movement", this.pressedKeys);
      },
    },
  },

  mounted() {
    console.log("FrontEnd: Setting up PongGame");
    this.context = (this.$refs as any).game.getContext("2d");
    if (!this.observing) {
      window.addEventListener("keydown", this.keyDown);
      window.addEventListener("keyup", this.keyUp);
      this.socket!.on("updatePosition", this.updatePlayer);
    } else {
      this.socket!.on("updatePosition", this.updateObserver);
    }
    window.onblur = this.releaseKeys;
  },

  unmounted() {
    console.log("FrontEnd: Unmounting PongGame");
    if (!this.observing) {
      window.removeEventListener("keydown", this.keyDown);
      window.removeEventListener("keyup", this.keyUp);
      this.socket!.removeListener("updatePosition", this.updatePlayer);
    } else {
      this.socket!.removeListener("updatePosition", this.updateObserver);
    }
    window.onblur = null;
  },
});
</script>

<style>
.game-bg {
  /* background-image: url("@/assets/new\ coders.png"); */
  background-repeat: no-repeat;
  background-position: center;
}

.game {
  width: 80vw;
  height: 80vh;
  border-top: 5px solid black;
  border-bottom: 5px solid black;
  border-left: 8px solid #b52b24;
  border-right: 8px solid #32a852;
  display: block;
  margin: auto;
  background-color: rgba(0, 0, 0, 0.3);
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
}

.p1-score {
  color: #b52b24;
}

.p2-score {
  color: #32a852;
}

.inline {
  display: inline !important;
}

.hotkeys {
  position: absolute;
}
</style>
