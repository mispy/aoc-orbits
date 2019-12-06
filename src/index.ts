import * as _ from 'lodash'
import './index.scss'
import { observable, computed, action, autorun } from 'mobx'
import * as d3_chromatic from 'd3-scale-chromatic'
const log = console.log

const SUN_RADIUS = 6955100 // km
const SUN_EARTH_DISTANCE = 1496000000 // km
const EARTH_RADIUS = 6371 // km
const MOON_RADIUS = 1731 // km

class Body {
    id: string
    planet: Body|null = null
    moons: Body[] = []
    @observable depth: number = 0
    random: number = Math.random()
    constructor(id: string) {
        this.id = id
    }

    get neighbors() {
        const neighbors = this.moons.slice()
        if (this.planet) {
            neighbors.push(this.planet)
        }
        return neighbors
    }

    pathToOrigin(): Body[] {
        const path: Body[] = []
        let planet: Body|null = this.planet
        while (planet) {
            path.push(planet)
            planet = planet.planet
        }
        return path
    }
}

class Puzzle {
    app: PuzzleApp

    constructor(app: PuzzleApp) {
        this.app = app
    }

    @computed get bodiesById(): {[id: string]: Body} {
        const bodies: {[id: string]: Body} = {}

        const getBody = (id: string) => {
            let planet = bodies[id]
            if (!planet) {
                planet = new Body(id)
                bodies[id] = planet
            }
            return planet
        }

        for (const line of this.app.options.puzzleInput.trim().split("\n")) {
            const [a, b] = line.split(")")
            if (!a || !b) continue

            const planet = getBody(a)
            const moon = getBody(b)
            planet.moons.push(moon)
            moon.planet = planet
        }

        for (const body of _.values(bodies)) {
            body.depth = body.pathToOrigin().length
        }

        ;(window as any).you = bodies['YOU']
        ;(window as any).com = bodies['COM']
        ;(window as any).san = bodies['SAN']

        return bodies
    }

    @computed get allBodies() {
        return _.values(this.bodiesById)
    }

    @computed get sun() {
        return this.allBodies.find(p => !p.planet) || this.allBodies[0]
    }

    @computed get leafBodies() {
        return this.allBodies.filter(p => !p.moons.length)
    }

    @computed get maxOrbitDepth(): number {
        return _.max(this.leafBodies.map(p => p.pathToOrigin().length)) || 0
    }

    @computed get numOrbits(): number {
        return _.sum(this.allBodies.map(b => b.depth))
    }

    @computed get youToSanPath(): Body[] {
        const you = this.bodiesById['YOU']
        const san = this.bodiesById['SAN']

        const frontier: Body[] = []
        const start = you.planet as Body
        frontier.push(start)
        const cameFrom = new Map<Body, Body>()

        while (frontier.length) {
            const current = frontier.pop() as Body
            for (const next of current.neighbors) {
                if (!cameFrom.get(next)) {
                    frontier.push(next)
                    cameFrom.set(next, current)
                }
            }
        }

        let current = san.planet as Body
        const path = []
        while (current !== start) {
            path.push(current)
            current = cameFrom.get(current) as Body
        }
        path.reverse()
        return path
    }
}


class PuzzleVisualization {
    app: PuzzleApp
    canvas: HTMLCanvasElement
    ctx: CanvasRenderingContext2D

    @observable canvasWidth: number = 0
    @observable canvasHeight: number = 0
    @observable timePassed: number = 0
    animationHandle: number|null = null
    drawTime: number = 1 * 1000

    constructor(app: PuzzleApp) {
        this.app = app
        this.canvas = document.getElementById("canvas") as HTMLCanvasElement
        this.ctx = this.canvas.getContext("2d") as CanvasRenderingContext2D
    }

    get puzzle() {
        return this.app.puzzle
    }

    @action.bound start() {
        window.addEventListener("resize", this.onResize)
        this.onResize()

        autorun(() => this.render())
        this.beginAnimation()
    }

    @action.bound onResize() {
        const width = this.canvas.parentElement!.offsetWidth
        const height = this.canvas.parentElement!.offsetHeight

        this.canvas.style.width = width+'px'
        this.canvas.style.height = height+'px'

        const scale = window.devicePixelRatio

        this.canvas.width = width*scale
        this.canvas.height = height*scale
        this.ctx.scale(scale, scale)

        this.canvasWidth = width
        this.canvasHeight = height
        this.render()
    }

    @action.bound beginAnimation() {
        if (this.animationHandle != null)
            cancelAnimationFrame(this.animationHandle)

        let start: number
        const frame = (timestamp: number) => {
            if (!start) start = timestamp
            const timePassed = 100000 +timestamp-start
            this.timePassed = timePassed
            this.animationHandle = requestAnimationFrame(frame)
        }
        this.animationHandle = requestAnimationFrame(frame)
    }

    // toRenderSpace(p: Point) {
    //     return Point.for(
    //         Math.round(this.canvasWidth/2 + this.cellPixelWidth * p.x),
    //         Math.round(this.canvasHeight/2 + this.cellPixelHeight * p.y)
    //     )
    // }

    render() {
        const { ctx } = this
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

        let COMx = 0, COMy = 0
        let YOUx = 0, YOUy = 0
        let SANx = 0, SANy = 0

        const placements: {[id: string]: { x: number, y: number, radius: number, orbitRadius: number }} = {}

        const placeBody = (body: Body, orbitRadius: number, cx: number, cy: number) => {
            const radius = body === this.puzzle.sun ? 30 : Math.max(1, 10 * 1/(1.5**body.depth))
            placements[body.id] = { x: cx, y: cy, radius: radius, orbitRadius: orbitRadius }
    
            for (let i = 0; i < body.moons.length; i++) {
                const moon = body.moons[i]
                const orbitDuration =  1/(1+body.depth**0.5) * 10000 * 2
                let theta = (body.random * 2*Math.PI) + (this.timePassed/orbitDuration * 2*Math.PI)
                const r = radius*6 + (radius*2*i)
                const x = cx + r*Math.sin(theta)
                const y = cy + r*Math.cos(theta)    
    
                placeBody(moon, r, x, y)
            }
        }

        placeBody(this.puzzle.sun, 0, this.canvasWidth/2, this.canvasHeight/2)


        if (this.app.options.showOrbits) {
            const renderOrbits = (body: Body) => {
                const {x, y, radius} = placements[body.id]
    
                for (const moon of body.moons) {
                    const place = placements[moon.id]
                    ctx.strokeStyle = "rgba(0, 255, 0, 0.8)" 
                    ctx.beginPath()
                    ctx.arc(x, y, place.orbitRadius, 0, 2*Math.PI)
                    ctx.stroke()
                    renderOrbits(moon)
                }
            }

            renderOrbits(this.puzzle.sun)
        }

        const renderBody = (body: Body) => {
            const {x, y, radius} = placements[body.id]
            const color = body === this.puzzle.sun ? "#fc4646" : "#ffffff"
            ctx.fillStyle = color 
            ctx.beginPath()
            ctx.arc(x, y, radius, 0, 2*Math.PI)
            ctx.fill()


            for (const moon of body.moons) {
                renderBody(moon)
            }
        }

        renderBody(this.puzzle.sun)

        if (this.app.options.showSolution1) {
            const renderLines = (body: Body) => {
                const {x, y, radius} = placements[body.id]
    
                for (const moon of body.moons) {
                    const place = placements[moon.id]
                    ctx.strokeStyle = "#0f0"
                    ctx.beginPath()
                    ctx.moveTo(x, y)
                    ctx.lineTo(place.x, place.y)
                    ctx.stroke()
                    renderLines(moon)
                }
            }

            renderLines(this.puzzle.sun)
        }

        if (this.app.options.showSolution2) {
            const path = this.puzzle.youToSanPath
            const prevplace = placements['YOU']
            for (const body of path) {
                const place = placements[body.id]

                ctx.strokeStyle = "#0f0"
                ctx.beginPath()
                ctx.moveTo(prevplace.x, prevplace.y)
                ctx.lineTo(place.x, place.y)
                ctx.stroke()
            }
        }

        ctx.fillStyle = "#fff"
        ctx.font = "12px Arial"
        ctx.textBaseline = 'middle'
        ctx.textAlign = "center"
        ctx.fillText("COM", placements.COM.x, placements.COM.y)

        ctx.fillStyle = "#0f0"
        ctx.font = "12px Arial"
        ctx.textBaseline = 'middle'
        ctx.textAlign = "center"
        ctx.fillText("YOU", placements.YOU.x, placements.YOU.y)

        ctx.fillStyle = "#0f0"
        ctx.font = "12px Arial"
        ctx.textBaseline = 'middle'
        ctx.textAlign = "center"
        ctx.fillText("SAN", placements.SAN.x, placements.SAN.y)
    }
}

class PuzzleControls {
    app: PuzzleApp
    constructor(app: PuzzleApp) {
        this.app = app
    }

    start() {
        const { app } = this
        const ui = document.querySelector("#ui") as HTMLDivElement

        const inputArea = ui.querySelector("textarea") as HTMLTextAreaElement
        inputArea.value = INITIAL_INPUT
        inputArea.oninput = () => { app.options.puzzleInput = inputArea.value }

        // const runWires = ui.querySelector("#runWires") as HTMLInputElement
        // runWires.onclick = () => { app.viz.drawTime = 1 * 1000; app.viz.beginAnimation() }
    
        // const runWiresSlowly = ui.querySelector("#runWiresSlowly") as HTMLInputElement
        // runWiresSlowly.onclick = () => { app.viz.drawTime = 60 * 1000; app.viz.beginAnimation() }
    
        const showOrbits = ui.querySelector("#showOrbits") as HTMLInputElement
        showOrbits.onchange = () => app.options.showOrbits = showOrbits.checked
        autorun(() => showOrbits.checked = app.options.showOrbits)

        const showSolution1 = ui.querySelector("#showSolution1") as HTMLInputElement
        showSolution1.onchange = () => app.options.showSolution1 = showSolution1.checked
        autorun(() => showSolution1.checked = app.options.showSolution1)

        const showSolution2 = ui.querySelector("#showSolution2") as HTMLInputElement
        showSolution2.onchange = () => app.options.showSolution2 = showSolution2.checked
        autorun(() => showSolution2.checked = app.options.showSolution2)

        const solution1 = document.getElementById("solution1") as HTMLParagraphElement
        const solution2 = document.getElementById("solution2") as HTMLParagraphElement
        const solution1Code = solution1.querySelector("code") as HTMLSpanElement
        const solution2Code = solution2.querySelector("code") as HTMLSpanElement

        const { options, puzzle } = app
        autorun(() => {
            if (options.showSolution1) {
                solution1.style.display = 'block'
                solution1Code.innerText = puzzle.numOrbits.toString()
            } else {
                solution1.style.display = 'none'
            }
        })

        autorun(() => {
            if (options.showSolution2) {    
                solution2.style.display = 'block'
                solution2Code.innerText = puzzle.youToSanPath.length.toString()
            } else {
                solution2.style.display = 'none'
            }
        })
    }
}

type PuzzleOptions = {
    puzzleInput: string
    showOrbits: boolean
    showSolution1: boolean
    showSolution2: boolean
}

class PuzzleApp {
    @observable options: PuzzleOptions = {
        puzzleInput: INITIAL_INPUT,
        showOrbits: false,
        showSolution1: false,
        showSolution2: false
    }

    puzzle: Puzzle = new Puzzle(this)
    viz: PuzzleVisualization = new PuzzleVisualization(this)
    controls: PuzzleControls = new PuzzleControls(this)

    start() {
        this.viz.start()
        this.controls.start()
    }
}

function main() {
    const app = new PuzzleApp()
    ;(window as any).app = app
    ;(window as any).puzzle = app.puzzle
    app.start()
}

const INITIAL_INPUT = `Z4X)3VF
HXK)QWX
X2G)R3L
QPS)YML
G5J)LMV
J7Y)JRF
MPW)6BZ
N1M)24G
5DZ)PMN
XVG)7Q5
8WN)NJ7
LPK)BCF
B98)4XV
R9C)Y1M
92F)918
JC2)HVF
5PT)W81
ZL7)XC4
FSP)1SK
DY3)NF6
6BZ)F8Z
PMN)Y4C
CZ7)JWK
J9S)PR3
3WY)8S2
TTH)2RR
VRB)F5Y
L1K)XVG
1M9)TGN
X84)XRZ
PX7)RGD
GZW)61P
SL3)CZ7
NY5)LSG
T8B)QK4
DB7)16B
KHL)2DD
5TR)YW2
Y4C)6XW
H2R)CVP
CVP)428
3CP)4MS
V69)QZ4
LQZ)QMC
Q4N)SRY
4FR)YQX
8C3)TX8
MMF)B98
WXW)9CW
4LV)XJN
R85)YOU
GW7)2WR
954)9LZ
F2T)1KX
P2S)B8G
FSY)D18
9DV)YMQ
K2G)SW4
VYK)78M
RHH)78Z
RLD)6WH
JJT)FHQ
6D4)F83
BQ8)S4L
LQZ)NXN
NP3)9CY
TJF)QFX
DTT)LHX
R73)JFD
PJH)XHG
FMG)34T
JLG)CWS
1RC)KQ3
4LW)6XM
ZWN)FL4
LQP)X25
TJF)X5L
X7X)HDF
2PW)K23
4GZ)6JM
T6T)7TN
FVD)GG8
RQ6)DCR
WQM)X84
CZY)JF6
TVG)LWH
94D)GH2
PM7)6W2
Z71)CBZ
1V2)3L5
YG9)KQ4
6DD)NJ4
24G)DFD
C58)TM9
K6L)8XW
TSP)5CH
YJJ)48R
654)BZQ
LHX)YNY
HGB)LLK
32C)B1T
6NB)PFL
428)VPH
LRH)7BQ
FW2)WW1
QMC)MG1
THH)56B
98Z)TZX
C2Q)FN7
G97)PZN
R6Y)MXP
NJ7)M8P
DW7)TRX
YNR)WZG
GNK)3H7
W3X)L8Z
YFR)2GN
JF5)MNS
QM5)RR4
XCY)4G5
NLG)1RC
BJS)JBD
DQM)S4H
FL4)JP8
5BX)K4F
HV1)XM1
DVY)1WT
XDL)32C
DDF)GVW
DFD)FVD
YNY)SAN
W4H)Z6R
RYF)Q98
86K)X58
M39)3VG
24M)CH4
4CX)5GL
BY1)23Q
VQD)WNX
6X4)WB8
N4X)TFV
XJN)KW8
DTH)P83
PPL)TK6
K2G)F95
1HP)8DD
129)4LV
RN9)76W
4SR)HQQ
TT1)FZY
6GP)VZJ
XWJ)YT5
VK5)YH6
KBL)924
X1C)1S5
QGQ)NJF
XD3)L2W
6NZ)RSW
HXF)JL7
NXK)VBT
4FM)8FR
K2F)PYV
K6X)QD6
JG3)8N7
L2K)2Y9
VJS)17H
FK9)X9R
2NJ)6FS
11R)3LB
SZZ)4FJ
B43)LCJ
P2N)Z81
48R)NKC
VFL)654
69L)NP3
RLR)Z71
8FV)6ZJ
YR4)42K
YML)W3X
2GN)VJS
5KF)VJ5
JPL)9LY
9CY)8JB
WB7)SZZ
WZG)5R6
FZB)X5P
8S6)C9L
34T)L1K
DNH)9JD
GKS)4HL
Y17)G6Q
47X)93F
XKQ)46H
NHW)5LP
21L)XBQ
YRG)X1F
LBP)6DV
6JM)488
58G)VQY
YD2)C1R
F5C)J7Y
YKV)ZWC
X9B)G9J
JL7)4VM
HP7)8V7
6C8)K36
BHJ)SJJ
RMH)2VW
VP6)K6X
VFB)X7X
2VP)V18
PZN)PM5
ZDB)2KN
PRT)425
JVX)MSQ
R57)D1M
S6F)DZL
7TT)D95
VF8)H1G
F1Y)FRV
KL9)NHJ
3BP)1B1
YQX)J1Y
L1X)5DZ
GKM)GJX
8PV)TVQ
YD1)6XZ
Q2G)GZW
2R9)BCQ
RR4)2YH
QWX)8FN
PBJ)TN8
YYW)HXF
4GZ)TT4
C6T)2GS
QXX)3JM
CWS)7PJ
8JH)CFG
DRD)8WN
76W)11R
XKT)SDP
PJR)M55
H5X)83Q
WP1)R73
HG2)LPM
SDP)DW7
SFB)P96
J1Y)BY1
KQ4)1VZ
5H8)L4D
C5G)8TH
2X9)SVL
D1J)ZNM
13V)C6T
FYQ)JJC
K4F)YD1
RV8)KPX
HLN)89K
G91)B99
F5Y)7TT
6GY)DTT
CCV)5LY
B9Z)DQS
MHT)J86
HKQ)XPF
JZF)RT3
5GL)2X9
KGH)DY4
RTD)MPW
T58)41Z
ZNM)M6Y
N1M)RTB
TZG)MFC
8P6)XFC
X9M)RD7
19S)XKT
G31)RLR
DYP)5T7
SF1)954
RTB)1MV
VBT)BQ4
Q96)8G6
LNV)24M
KZ3)N4S
H9P)BX6
82K)K74
1FJ)SN3
TDM)PC1
3V1)DK8
3X7)QJ8
L4D)G4G
H86)XWJ
8FN)26D
8QY)M98
JRF)TTH
8TK)YLM
SXM)KZ3
6RS)843
J7Y)H1T
2V7)XZ9
R9X)SFL
JQC)THH
1B1)1X4
7QK)LRY
VHR)SS8
ZXH)XKB
F6R)6NZ
P83)6YS
XM1)9S4
8R2)YFR
7FR)LQP
LHH)WN1
XFC)KYD
PLL)2H5
NF6)WQM
PMD)2V2
BQ4)PRT
2Y9)4HX
PR3)ZX9
ZNV)K4T
18V)ZL7
4R1)VBK
Y83)T8B
FZY)S56
6W2)B7S
NL3)W4Y
C6T)TDX
1CR)3L1
XK9)SPT
96R)SF1
S7Z)H1C
M8P)VP3
3Q7)XDB
2H5)F92
SVJ)HB4
XMQ)93Q
YNP)XPL
PM5)FTV
2SK)RJN
JWH)4LW
NJF)M39
TM5)Q3L
ZYW)Y86
8DD)TN4
1NK)4DC
JS9)NXK
C9L)1P9
SYP)NX2
TCF)6S1
4CC)JSJ
WWL)NL3
VZJ)C58
V26)WN2
56B)FWB
CH4)Q6B
DK8)BVX
VQY)4H7
P7W)XP2
Q6H)2PW
TN8)VFL
TW3)KRJ
G4G)VKY
P74)DMF
6NT)NZF
BM9)JWH
W73)XKV
3KR)C5F
TX8)9Q9
JVF)NHT
DXH)H86
C1R)4N7
XZV)3CP
8LW)S6M
W7M)MB3
822)YWX
RGD)DB7
RX2)ZW3
GYX)ZH4
279)LKF
1KX)LRH
ZX9)8WL
ZW4)C5G
Q25)VYK
DFD)NYL
GZ9)6L1
8DD)LHH
FWZ)8FH
HQQ)7CK
ZHV)6X4
XRZ)XTW
TMG)S1R
5XK)ZS6
L81)JF2
4V2)GQS
5KM)GQZ
HRP)ZNV
DVZ)G9Q
L9P)3BN
BCF)XKQ
TS5)44R
B8G)XDL
C63)Y17
CBZ)T15
Z3X)XK9
WTG)TVG
6XW)HXK
4C6)P2R
R2R)WKH
47R)Q4N
ZBZ)H9P
4DC)KHL
GG8)YK2
K2Q)5SV
TYQ)6BS
DLK)VFB
KSJ)R57
BPV)K6L
PFL)RZD
3L1)DNH
2VS)SNV
K4X)G31
WKH)HKQ
5DZ)SFB
4B3)TR2
JC7)822
PPC)4SP
S1R)65Z
CY8)YKV
5LY)X4J
Q3L)DXH
K23)HLN
HMX)LNL
JJ4)RHH
D95)8R2
LCJ)VNV
2ND)PJN
B73)C2S
24D)NY5
1SK)JVF
67X)FPG
XZP)G55
ZW4)V69
FRV)CK2
D6M)BJS
XPL)RBB
LZS)129
8JB)D81
J4T)Z4K
6D4)PCG
M6Y)SVX
CWS)RQ6
JC9)Q25
LMT)FWZ
JP8)6D4
P74)H2D
G6J)X3J
VR9)4YF
WHL)832
RT3)ZYW
8XW)F8L
4HL)X35
QXS)QGQ
T15)BPV
P2R)SPP
4S4)BHJ
3L5)76V
55S)3Q7
F8Z)X9K
6S6)HRR
M18)BQ8
5SH)GY4
TT4)M18
LPB)82K
G26)3VT
KW8)VYL
MNS)Y83
VTW)ZBZ
G1X)H6Y
6XM)1TW
D18)G26
LNL)L2K
SD3)2CN
B8L)P74
ZH4)TTQ
2DD)VHK
3FD)2SK
L1D)RN9
WSF)Y99
4NH)P2N
D81)GW7
1BJ)9QM
2MS)CHT
W81)VXX
QXJ)656
6YS)5YL
K36)RMH
GXX)GGF
YLM)GT8
YP7)RLD
16B)FZB
MQM)R6X
4YF)3SN
XKV)X9M
GT5)PPC
FL4)BMM
46H)VK5
QZ4)YG9
9CW)6GP
1XX)PPL
NHJ)X2G
25F)SL3
ZLY)RX2
41Z)WSF
PJF)PLL
SD3)R9W
2R9)2VS
HZ4)7CJ
R3L)YNR
1P9)BM9
TDX)LNV
QQX)L1X
H1G)8TK
N9H)N2V
8VC)9X7
H1G)JLG
CZG)5SH
318)H2R
VZG)92F
ZW3)WSX
JJT)7NZ
VYL)GNK
V2B)98Z
Y33)G1X
CK2)6R2
Y86)2V7
4HX)6S6
FYX)MVZ
8YY)S93
X25)F2T
F95)135
C94)L1D
QBW)HP7
RX2)PJR
JFV)51W
BCQ)CZY
T12)RNP
1X9)X9B
CBZ)XYW
D1M)HHL
1LH)21L
5ZG)2JJ
7TD)3D6
HQQ)TMZ
5D7)DDF
KK4)8C4
918)1XX
NLG)K67
SNV)TZG
JZF)DNW
SW4)XQY
RYL)SVJ
S6M)CD7
R6X)RHQ
2YH)DRD
XP2)QC1
NS6)5D7
LWH)JS9
2YV)3M4
TM5)KL9
PCK)6DD
V18)8P6
BTX)QG3
B99)HG2
1X9)K6T
YD6)13V
ZWK)BCX
SRY)N9H
HZ4)1HH
KYD)GHV
6XZ)WWL
G9Q)V2B
135)PJF
PJN)NSF
GHV)3L7
TVQ)PW8
HRR)1BJ
RD7)6L7
9LY)9DV
K74)S6F
VP3)RCJ
NX2)6NB
VHK)KGH
9QM)XZW
NZF)5Q8
VQY)ZWK
YK2)FW2
X5P)69L
WHD)QXX
RSW)LC3
9S4)HRP
TTQ)L6S
RVV)4CC
XPF)D64
NYV)K4X
6BS)XZP
HDF)ZXH
GQS)K2Q
G5F)ML7
CHT)38Y
1HP)HMX
N4X)HT2
N5W)X8C
VGW)2ND
7CJ)TW3
DQK)XZQ
S46)G5F
GQZ)PX7
ZKR)8LW
GVW)Y33
1MV)ZHV
XK2)1YR
DLK)R2R
KPX)VP6
B1T)KJ7
COM)47X
7FR)XL9
HTH)648
2KN)GZ9
D3V)R6Y
R9M)VHR
38Y)9CJ
MFC)BBH
31T)HTH
5SV)L69
QH5)D1C
RHQ)F4N
1YR)JL8
GWV)4NH
1MR)JVM
9LW)8PV
WKH)KFS
WN2)ZZY
TFV)S7Z
69L)JJT
4H7)B8L
DNW)1X9
17H)1V2
4FJ)V4T
JSJ)LPB
93F)P7W
QK4)4CL
648)62B
G31)ZLY
BVX)ZW4
XZW)DTH
PHC)PWH
VLP)M8B
J58)R9C
4L2)THX
NKC)WHL
4HX)L8T
RVV)L9P
JFD)GKS
K2P)FMG
DQS)XCY
XBQ)FSP
4V2)HV1
3SN)T6Q
Q73)PZV
9NZ)L3K
H32)Z4X
8V7)Q73
PYV)C36
TGN)XD3
YHN)JCL
Q96)XR4
8FR)GKM
MPF)NHW
X9R)4CP
YMQ)D3V
1TW)JFV
4SP)RVV
XP2)K2P
H57)LMT
T7T)877
2BB)G92
GGF)S18
QCW)8S6
V4T)LBP
Y1M)RQ3
TMZ)ZDB
S6M)YD6
6ZJ)F6R
WB8)QQX
3M4)58G
GY4)MYS
23X)TZQ
XKB)JC7
9LW)T58
FPJ)XK2
JL8)WTG
LC3)R85
3JM)DY3
BMM)3V1
FPG)7FL
XR4)RV8
3VT)JQC
8WL)W73
DKH)TCF
G9G)7XP
96Y)TDM
NJ4)FPJ
5LP)YRG
3L7)X1C
1VZ)K2G
JWK)VRB
7FL)5S5
4CP)6C8
JF2)CY8
L6S)1NK
88G)H5X
H8B)28K
LRY)W45
MG1)9NZ
2NJ)J9S
PW8)PM7
XX1)96R
129)67X
TN8)ML5
YY9)XMQ
42K)G91
2VS)T6T
JKM)QXS
WN1)2X4
BVB)4B9
GJX)7TD
9CJ)H32
7NZ)6GS
KRJ)M9Y
SNJ)G8G
76W)DXT
7J4)4V2
TQW)BVN
9YW)8FV
SM2)H29
RQ3)35T
H1C)1MR
YHF)Q2G
WHL)HZ4
4FR)C33
L9P)19S
8FH)5XK
NYL)V4C
89K)XLZ
XTW)GT5
9NF)7FR
BBH)QT7
4G5)SXM
B7S)1HP
NX9)N4X
DZP)6HK
XWJ)6GG
GQJ)R9X
JXQ)QCJ
VBT)JPL
4N7)VQD
7TN)13W
HRP)32V
M8B)9KL
KFS)BVB
LHH)5BX
QCJ)FSY
V97)318
S56)5KF
1S5)5BR
6R2)MQM
FYX)1FJ
GH2)ZKR
843)LDK
LSG)RMS
32V)3WY
TR2)18V
GLZ)HGB
ZZ5)GXX
CH4)PHC
5MQ)JKC
924)88G
FWB)KBL
R9W)4FM
5Q8)G9G
X3J)JC9
C2S)F5C
9Q9)KHZ
6HK)DLK
Z81)5MQ
6GG)BZ2
9LZ)6JS
1WT)YR4
SS8)C63
1P9)YVX
D64)7J4
XYW)PJX
6WH)W4H
SVX)T7T
6W2)4XF
2X4)MPF
DQS)JKM
KQ3)B43
HHL)25F
1C6)L53
24M)TT1
L2W)VSB
ML7)DVZ
NS6)XZV
RJN)PMD
VPH)RYF
PC1)J4T
425)3X7
XDB)VF8
5S5)QXJ
93Q)2NJ
MB3)MMF
GYX)4S4
6JS)JMT
ZS6)LXH
1HH)2R9
NCP)5H8
G9J)6RS
76V)XX1
D6M)N83
VQT)5JJ
3BN)DV5
JKC)55S
QFX)F1Y
MVZ)NX9
J86)T12
2V2)BTX
D1C)GWV
W45)WHD
9XM)KKC
TK6)ZZ5
F92)8QY
F8L)RTD
8S2)N5W
DZP)QH5
XZ9)C2Q
M55)QMY
SPT)2B8
LPM)K8T
4SP)H2F
QJ8)FKN
7PJ)3BP
XC4)FYQ
TM9)2MS
C33)8C3
TQ6)S38
35T)TSP
4MS)H82
SPP)KK4
YW2)YP7
S93)JF5
RNP)JJ4
Q6B)JVX
VNV)TQW
G8G)DZP
N2V)9YW
DFR)DQK
G92)SD3
L3K)9NF
H2F)279
SN3)G6J
QD6)4JS
FHQ)D1J
9X7)86K
1X4)YYW
QG3)Y9T
6GS)4SR
JJ4)WP1
FZT)WB7
5BR)S46
LTW)TYQ
DXT)LQZ
FZT)VTW
W4Y)23X
NRH)TQ6
MSQ)VZG
HT2)KSJ
B69)FK9
7BQ)79F
CFG)D6M
DV5)GQJ
TR2)DYP
4C6)P2S
XPF)2YV
65Z)5KM
3VG)C94
2KN)LPK
6L7)TMG
ML5)H57
BX6)GYX
2VW)LTW
76V)LPH
NXN)WXW
PMD)VLP
XHG)QM5
F34)5PN
C7Q)94D
X84)1M9
FN7)DKH
6FS)PJH
MXP)JG3
2V7)MHT
417)9XM
3D6)H8B
H1T)V97
WNX)J8R
78Z)NLG
VZG)5PT
QM5)N1M
F83)W7M
DMF)V26
N83)FZT
JF6)1CR
S4H)DVY
HB4)GP4
H82)CCV
Q89)F1H
H2D)QPS
6L1)5TR
19S)DFR
QC1)7QK
FTV)YY9
8TH)4L2
DCR)Q89
2GS)G97
9JD)Z3X
3LB)6NT
TN4)SVY
656)4R1
CD7)Q6H
5T7)NXQ
BPV)417
NSF)MRC
F4N)B69
HVF)RYL
LMV)4GZ
RZD)2VP
P96)SM2
7CK)XVC
YT5)24D
M9Y)ZCM
61P)6J7
BZ2)DQM
TRX)PBJ
X58)5ZG
PZV)7D1
G55)JZF
5CH)3KR
Y99)1C6
DZL)QFC
5LY)R9M
ZWC)GLZ
YVX)F34
9KL)YHN
62B)VGW
JVM)B73
DY4)1LH
8G6)L81
T6Q)NCP
S4L)ZWN
X8C)4CX
SVY)K2F
JF6)NS6
BM9)4FR
GT8)3FD
832)YNP
6J7)QBW
4XF)Q96
1SK)31T
Y1M)96Y
51W)TKW
JMT)VR9
LLK)TJF
488)4C6
83Q)YHF
Y9T)C7Q
TZX)8VC
VSB)B9Z
VKY)47R
7D1)SYP
2WR)NYV
X5L)8YY
QMY)G5J
2B8)JXQ
WSX)FYX
V4C)8JH
H9P)NRH
2JJ)6GY
DXH)2BB
6S1)VQT
877)YD2
L53)TS5
K67)PCK
3VF)CZG
MYS)YJJ
1MR)4B3
VNV)QCW
LPH)TM5
13W)LZS
K6T)J58
RBB)9LW
5KM)JC2
FKN)SNJ`

main()