/* global nodecg, Vue */
// Panel Sorteos: elegir qué se sortea, ver los boletos y sortear. Los boletos salen de
// shared/sorteos.js (las mismas reglas que usa la extensión) y el ganador lo elige
// extension/sorteos.js; este panel solo hace la ruleta hasta ese ganador.
(function () {
  const S = window.MamesSorteos;
  const I = window.MamesIncentivos;

  const TIPOS = [
    { id: 'rifa', boton: 'POR<br>RECOMPENSA', etiqueta: 'POR RECOMPENSA' },
    { id: 'minima', boton: 'DONACION<br>MINIMA', etiqueta: 'DONACION MINIMA' },
    { id: 'acumulada', boton: 'DONACION<br>ACUMULADA', etiqueta: 'DONACION ACUMULADA' }
  ];
  const VUELTAS = 36; // nombres que pasan por la ruleta antes de caer en el ganador
  const formatoDinero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
  const clone = (v) => (v === undefined || v === null ? v : JSON.parse(JSON.stringify(v)));
  const pad = (n) => String(n).padStart(2, '0');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  new Vue({
    el: '#app',
    data: {
      TIPOS,
      donaciones: [],
      rifasTiltify: [],
      historial: [],
      total: 0,
      tipo: 'rifa',
      rifaId: null,
      montos: { minima: '100', acumulada: '500' },
      buscar: '',
      ruleta: '?????',
      ganadorVisible: false,
      girando: false,
      // Mientras gira la ruleta se muestra el historial de antes: el ganador nuevo puede llegar
      // antes de que la ruleta termine y no debe verse en la tabla ni en el historial
      congelado: null,
      error: '',
      confirmarBorrar: false
    },
    computed: {
      resumen() {
        const lista = S.donaciones(this.donaciones);
        return { donaciones: lista.length, donantes: new Set(lista.map((d) => d.nombre)).size };
      },
      rifas() {
        return this.rifasTiltify.map((r) => {
          const lista = S.boletos(this.donaciones, { tipo: 'rifa', rifaId: r.id });
          const [titulo, donador] = I.separarNombre(r.name);
          return {
            id: String(r.id), titulo: titulo || 'SIN NOMBRE', donador, imagen: (r.image && r.image.src) || '',
            boletos: lista.length, personas: S.personas(lista)
          };
        });
      },
      sorteo() {
        if (this.tipo === 'rifa') return this.rifaId ? { tipo: 'rifa', rifaId: this.rifaId } : null;
        return { tipo: this.tipo, minimo: S.leerMonto(this.montos[this.tipo]) };
      },
      boletos() { return S.boletos(this.donaciones, this.sorteo); },
      personas() { return S.personas(this.boletos); },
      historialMostrado() { return this.congelado || this.historial; },
      historialVisible() { return this.historialMostrado.slice().reverse(); },
      ganadoresDelSorteo() {
        const clave = S.clave(this.sorteo);
        return this.historialMostrado.filter((h) => h.clave === clave);
      },
      ganados() { return new Set(this.ganadoresDelSorteo.map((h) => h.boletoId)); },
      libres() { return this.boletos.filter((b) => !this.ganados.has(b.id)); },
      porcentaje() {
        const pct = 100 / this.libres.length;
        return `${pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%`;
      },
      filas() {
        const texto = this.buscar.trim().toLowerCase();
        return this.boletos
          .map((b, i) => ({ ...b, n: pad(i + 1), gano: this.ganados.has(b.id) }))
          .filter((f) => !texto || f.nombre.toLowerCase().includes(texto));
      },
      etiqueta() { return TIPOS.find((t) => t.id === this.tipo).etiqueta; },
      escena() {
        if (this.tipo === 'rifa') {
          const r = this.rifas.find((x) => x.id === this.rifaId) || {};
          return { titulo: r.titulo, detalle: r.donador ? `DONADO POR ${r.donador}` : '', imagen: r.imagen };
        }
        const monto = this.dinero(S.leerMonto(this.montos[this.tipo]));
        return {
          titulo: this.tipo === 'minima' ? 'DONACION MINIMA' : 'DONACION ACUMULADA',
          detalle: this.tipo === 'minima' ? 'UN BOLETO POR DONACION DESDE' : 'UN BOLETO SI LO DONADO SUMA',
          monto
        };
      }
    },
    watch: {
      // Otro sorteo: la ruleta se vacía
      sorteo(nuevo, viejo) {
        if (S.clave(nuevo) === S.clave(viejo) || this.girando) return;
        this.ruleta = '?????';
        this.ganadorVisible = false;
        this.error = '';
      }
    },
    created() {
      nodecg.Replicant('alldonations', 'nodecg-tiltify').on('change', (v) => { this.donaciones = Array.isArray(v) ? clone(v) : []; });
      nodecg.Replicant('rewards', 'nodecg-tiltify').on('change', (v) => {
        this.rifasTiltify = Array.isArray(v) ? clone(v) : [];
        if (!this.rifaId && this.rifasTiltify.length) this.rifaId = String(this.rifasTiltify[0].id);
      });
      nodecg.Replicant('total', 'nodecg-tiltify').on('change', (v) => { this.total = Number(v) || 0; });
      nodecg.Replicant('mamesSorteosHistorial').on('change', (v) => { this.historial = Array.isArray(v) ? clone(v) : []; });
    },
    methods: {
      dinero(v) { return formatoDinero.format(Number(v) || 0); },
      hora(valor) {
        const d = new Date(valor);
        return Number.isNaN(d.getTime()) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      },
      fechaHora(valor) {
        const d = new Date(valor);
        return Number.isNaN(d.getTime()) ? '' : `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      },
      cambiarTipo(id) { this.tipo = id; this.buscar = ''; },
      elegirRifa(id) { if (!this.girando) this.rifaId = id; },
      // Solo números en el campo de monto
      limpiar() { this.montos[this.tipo] = String(this.montos[this.tipo]).replace(/[^0-9]/g, ''); },

      async sortear() {
        if (this.girando || !this.libres.length) return;
        const nombres = this.libres.map((b) => b.nombre);
        this.girando = true;
        this.ganadorVisible = false;
        this.error = '';
        this.congelado = this.historial.slice();
        let registro;
        try {
          registro = await nodecg.sendMessage('mames:sortear', this.sorteo);
        } catch (err) {
          this.error = (err && err.message) || String(err);
          this.congelado = null;
          this.girando = false;
          return;
        }
        let espera = 40;
        for (let k = 0; k < VUELTAS; k++) {
          this.ruleta = nombres[Math.floor(Math.random() * nombres.length)];
          await sleep(espera);
          espera *= 1.07; // unos 6 s en total
        }
        this.ruleta = registro.nombre;
        this.ganadorVisible = true;
        this.congelado = null;
        this.girando = false;
      },

      // Dos clics: el primero pide confirmar y se cancela solo a los 4 s
      async borrar() {
        if (!this.confirmarBorrar) {
          this.confirmarBorrar = true;
          setTimeout(() => { this.confirmarBorrar = false; }, 4000);
          return;
        }
        this.confirmarBorrar = false;
        try {
          await nodecg.sendMessage('mames:sorteos-borrar');
        } catch (err) {
          this.error = `No se pudo borrar: ${(err && err.message) || err}`;
        }
      }
    }
  });
})();
