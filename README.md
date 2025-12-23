# **🌊 Pulse Studio**

**A vibe-coded experiment in browser-based music sequencing.**

*Built and iterated within the new **Google Antigravity** IDE.*

Pulse Studio is a pattern-based step sequencer and audio workstation running entirely in the browser. It combines a classic 16-step grid workflow with a modular FX graph, real-time synthesis, and cloud synchronization—all contained within a lightweight, vanilla JavaScript architecture.

## **🚀 The "Antigravity" Experiment**

This project serves as a testbed for the **Google Antigravity IDE**.

The development process was "vibe coded"—meaning the focus was on flow, intuition, and rapid iteration rather than rigid engineering specifications. The goal was to see how fluidly a complex, state-heavy application (like a DAW) could be constructed when the barrier between thought and code is removed.

## **✨ Key Features**

### **🎹 Sequencing & Synthesis**

* **16-Step Grid:** Classic TR-style sequencing with velocity and offset support.  
* **Real-time Synthesis:** All sounds are generated mathematically via the Web Audio API (No samples).  
* **Scale Locking:** Built-in musical theory. Switch between *C Maj Pent, Blues, Phrygian*, and more on the fly.  
* **Unroll Mode:** Toggle between a compact view and a full chromatic piano roll.

### **⚡ Modular FX Graph**

* **Visual Patching:** A canvas-based node editor for routing audio.  
* **Available Nodes:** Delay, Reverb (Convolution), Distortion, Filter, Compressor.  
* **Smart Wiring:** Drag nodes onto cables to insert them; Shift-drag to detach.

### **🤖 Generative Tools**

* **AI Pattern Generator:** Type a vibe (e.g., "Techno", "Trap", "Chill") to procedurally generate rhythmic patterns.  
* **Remix Engine:** Randomize drum synthesis parameters to find new kits instantly.

### **☁️ Cloud & Arrangement**

* **Timeline View:** Drag-and-drop arrangement of patterns to build full songs.  
* **Cloud Sync:** Real-time saving via Firebase Firestore.  
* **Sharing:** Generate unique Song IDs to share your beats with friends.

## **🛠️ Tech Stack**

* **Core:** HTML5, Vanilla JavaScript (ES Modules).  
* **Styling:** Tailwind CSS (via CDN).  
* **Audio Engine:** Native Web Audio API.  
* **Backend:** Firebase (Auth & Firestore) for persistence.  
* **Environment:** Google Antigravity.

## **🎮 Controls & Shortcuts**

| Key / Action | Function |
| :---- | :---- |
| **Space** | Play / Stop |
| **Ctrl \+ Z / Y** | Undo / Redo |
| **Ctrl \+ Drag** | Duplicate Notes (in Grid) or Patterns (in Timeline) |
| **Shift \+ Click** | Select multiple notes/patterns |
| **Double Click** | (Timeline) Queue a pattern for playback |
| **Right Click** | (FX Graph) Add Node / (Clip) Loop Lock |

## **📦 Installation / Setup**

Since this is a client-side application using CDNs, it requires no build step.

1. **Clone the repo**  
2. Configuration:  
   The application relies on Firebase for saving/sharing. You must provide a valid configuration object in the HTML or a config file:  
   const \_\_firebase\_config \= JSON.stringify({  
     apiKey: "YOUR\_API\_KEY",  
     authDomain: "YOUR\_PROJECT.firebaseapp.com",  
     projectId: "YOUR\_PROJECT\_ID",  
     // ... rest of firebase config  
   });

3. **Run:** Open index.html in a modern browser (Chrome/Edge/Firefox). Note: Interaction is required to start the Audio Context.

## **🔮 Future Vibes**

* **LFO Modulation:** Connecting Low-Frequency Oscillators to FX parameters.  
* **Sample Support:** Drag-and-drop audio file support.  
* **MIDI Out:** Controlling external gear via WebMIDI.

*Slopped out with 💜 by ericbac.us*
