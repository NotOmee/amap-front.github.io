class MapRoutePlanner {
    constructor() {
        this.map = null;
        this.driving = null;
        this.contextMenu = null;
        
        this.markers = {
            start: null,
            end: null,
            point: null,
            waypoints: []
        };
        
        this.points = {
            start: null,
            end: null,
            waypoints: [],
            route: []
        };
        
        this.polylines = [];
        this.timers = [];
        
        this.config = {
            gnssUrl: 'http://127.0.0.1:8000',
            securityCode: '',
            jsApi: ''
        };

        this.gnssStatus = {
            positionFollower: false,
            simulatorStatus: false
        }
        
        this.init();
    }
    
    init() {
        this.loadConfig();
        this.bindEvents();
        this.initAmap();
    }
    
    loadConfig() {
        // 从localStorage加载高德api等
        const apiConfig = JSON.parse(localStorage.getItem('apiConfig'));
        if (apiConfig) {
            this.config = apiConfig;
        }
    }
    
    bindEvents() {
        // 读取api文件
        const apiConfigFileInput = document.getElementById('api-config-file');
        if (apiConfigFileInput) {
            apiConfigFileInput.addEventListener('change', (e) => this.loadApiConfig(e.target.files[0]));
        }
        
        // 保存路径点
        const savePointsBtn = document.getElementById('save-points');
        if (savePointsBtn) {
            savePointsBtn.addEventListener('click', () => this.savePoints());
        }
        
        // 重设地图中心
        const setCenterBtn = document.getElementById('set-center');
        if (setCenterBtn) {
            setCenterBtn.addEventListener('click', () => this.setMapCenter());
        }
        
        // 读取track文件
        const pathFileInput = document.getElementById('input-pathfile');
        if (pathFileInput) {
            pathFileInput.addEventListener('change', (e) => this.loadPathFile(e));
        }
        
        // GNSS控制
        this.bindGnssControls();
    }
    
    bindGnssControls() {
        const positionFollowerBtn = document.getElementById('position-follower-trigger');
        const gnssSimulatorTriggerBtn = document.getElementById('gnss-simulator-trigger');
        
        if (positionFollowerBtn){
            positionFollowerBtn.addEventListener('click', () => {
                if (this.gnssStatus.positionFollower) {
                    positionFollowerBtn.textContent = '开始跟踪坐标';
                    this.stopPositionTracking();
                } else {
                    positionFollowerBtn.textContent = '停止跟踪坐标';
                    this.startPositionTracking();
                }

                this.gnssStatus.positionFollower = !this.gnssStatus.positionFollower;
            });
        }

        if (gnssSimulatorTriggerBtn){
            gnssSimulatorTriggerBtn.addEventListener('click', () => {
                if (this.gnssStatus.simulatorStatus) {
                    gnssSimulatorTriggerBtn.textContent = '开始gnss模拟';
                    this.stopGnssSimulator();
                } else {
                    gnssSimulatorTriggerBtn.textContent = '停止gnss模拟';
                    this.startGnssSimulator();
                }

                this.gnssStatus.simulatorStatus = !this.gnssStatus.simulatorStatus;
            })
        }
    }

    loadApiConfig(file) {
        try {
            const reader = new FileReader();
            reader.onload = (e) => {
                const config = JSON.parse(e.target.result);
                this.config.gnssUrl = config.gnssUrl;
                this.config.jsApi = config.jsApi;
                this.config.securityCode = config.securityCode;

                localStorage.setItem('apiConfig', JSON.stringify(config));

                this.initAmap();
            }
            reader.readAsText(file);
            console.info("读取配置文件成功", this.config)


        } catch (error) {
            console.error("loadApiConfig error: ", error)
        }
    }
    
    initAmap() {
        if (!this.config.jsApi) {
            console.warn('请先配置JS API Key');
            return;
        }
        
        // 配置安全密钥
        if (typeof window._AMapSecurityConfig === 'undefined') {
            window._AMapSecurityConfig = {};
        }
        window._AMapSecurityConfig.securityJsCode = this.config.securityCode;
        
        AMapLoader.load({
            key: this.config.jsApi,
            version: "2.0",
            plugins: ["AMap.Driving"]
        })
        .then((AMap) => {
            console.log('高德地图 API 加载完成');
            this.setupMap(AMap);
        })
        .catch(e => {
            console.error('高德地图加载失败：', e);
            this.showStatus('地图加载失败，请检查API配置', 'error');
        });
    }
    
    setupMap(AMap) {
        // 创建地图实例
        this.map = new AMap.Map("container", {
            resizeEnable: true,
            center: [113.265181,23.128150],
            zoom: 13
        });

        window.map = this.map;
        
        // 初始化导航
        this.driving = new AMap.Driving({
            map: this.map,
            panel: "panel"
        });
        
        // 设置右键菜单
        this.setupContextMenu(AMap);
        
        // 绑定地图事件
        this.bindMapEvents(AMap);
    }
    
    setupContextMenu(AMap) {
        // 设置右键菜单
        this.contextMenu = new AMap.ContextMenu();
        
        const menuItems = [
            {
                text: "设置起点",
                action: (e) => {
                    this.setStartPoint(e.lnglat);
                    this.contextMenu.close();
                }
            },
            {
                text: "设置终点",
                action: (e) => {
                    this.setEndPoint(e.lnglat);
                    this.contextMenu.close();
                }
            },
            {
                text: "添加路径点",
                action: (e) => {
                    this.addWayPoint(e.lnglat);
                    this.contextMenu.close();
                }
            },
            {
                text: "规划路线",
                action: () => {
                    this.calculateRoute();
                    this.contextMenu.close();
                }
            },
            {
                text: "清除",
                action: () => {
                    this.clearAll();
                    this.contextMenu.close();
                }
            },
            {
                text: "设置自车位置",
                action: (e) => {
                    this.setVehiclePosition(e.lnglat)
                    this.contextMenu.close();
                }
            }
        ];
        
        menuItems.forEach(item => {
            this.contextMenu.addItem(item.text, () => item.action({ lnglat: this.contextMenuPosition }));
        });
        
        this.map.on("rightclick", (e) => {
            this.contextMenu.open(this.map, e.lnglat);
            this.contextMenuPosition = e.lnglat;
        });
    }
    
    bindMapEvents() {
        this.map.on('click', (e) => {
            this.setPoint(e.lnglat);
        });
    }
    
    setPoint(lnglat) {
        if (!this.map) return;
        
        // 移除旧标记
        if (this.markers.point) {
            this.map.remove(this.markers.point);
        }
        
        // 创建新标记
        this.markers.point = new AMap.Marker({
            position: [lnglat.lng, lnglat.lat],
            map: this.map,
            icon: 'https://webapi.amap.com/theme/v1.3/markers/n/mark_b.png',
            offset: new AMap.Pixel(-13, -30)
        });
        
        // 更新坐标显示
        const gcj02Text = `${lnglat.lng.toFixed(6)},${lnglat.lat.toFixed(6)}`;
        const wgs84 = CoordinateConverter.gcj2wgs(lnglat.lng, lnglat.lat);
        const wgs84Text = `${wgs84[0]},${wgs84[1]}`;
        
        this.updateCoordinateDisplay('selected-coord', `GCJ02: ${gcj02Text}`);
        this.updateCoordinateDisplay('selected-coord-wgs84', `WGS84: ${wgs84Text}`);
    }
    
    setStartPoint(lnglat) {
        this.points.start = [lnglat.lng, lnglat.lat];
        this.updateMarker('start', lnglat, 'https://webapi.amap.com/theme/v1.3/markers/n/start.png');
        this.updateCoordinateDisplay('start-coord', `${lnglat.lng.toFixed(6)},${lnglat.lat.toFixed(6)}`);
        this.updateRouteStatus();
    }
    
    setEndPoint(lnglat) {
        this.points.end = [lnglat.lng, lnglat.lat];
        this.updateMarker('end', lnglat, 'https://webapi.amap.com/theme/v1.3/markers/n/end.png');
        this.updateCoordinateDisplay('end-coord', `${lnglat.lng.toFixed(6)},${lnglat.lat.toFixed(6)}`);
        this.updateRouteStatus();
    }
    
    addWayPoint(lnglat) {
        const point = [lnglat.lng, lnglat.lat];
        this.points.waypoints.push(point);
        
        const marker = new AMap.Marker({
            position: point,
            map: this.map,
            icon: 'https://webapi.amap.com/theme/v1.3/markers/n/mark_b.png',
            offset: new AMap.Pixel(-13, -30)
        });
        
        this.markers.waypoints.push(marker);
        this.showStatus(`已添加路径点 ${this.points.waypoints.length}`, 'info');
    }
    
    updateMarker(type, lnglat, iconUrl) {
        // 移除旧标记
        if (this.markers[type]) {
            this.map.remove(this.markers[type]);
        }
        
        // 创建新标记
        this.markers[type] = new AMap.Marker({
            position: [lnglat.lng, lnglat.lat],
            map: this.map,
            icon: iconUrl,
            offset: new AMap.Pixel(-13, -30)
        });
    }
    
    updateCoordinateDisplay(elementId, text) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = text;
        }
    }
    
    updateRouteStatus() {
        const statusInfo = document.getElementById('status-info');
        if (!statusInfo) return;
        
        if (this.points.start && this.points.end) {
            this.showStatus('起点和终点已设置，可以开始规划路线', 'ready');
        } else if (this.points.start) {
            this.showStatus('起点已设置，请设置终点', 'warning');
        } else if (this.points.end) {
            this.showStatus('终点已设置，请设置起点', 'warning');
        }
    }
    
    calculateRoute() {
        if (!this.points.start || !this.points.end) {
            this.showStatus('请先设置起点和终点', 'error');
            return;
        }
        
        this.driving.search(
            this.points.start,
            this.points.end,
            { waypoints: this.points.waypoints },
            (status, result) => {
                if (status === 'complete') {
                    this.processRouteResult(result);
                    this.showStatus('路线规划完成', 'success');
                } else {
                    this.showStatus('路线规划失败，请重试', 'error');
                    console.error('获取驾车数据失败：', result);
                }
            }
        );
    }
    
    processRouteResult(result) {
        this.points.route = [];
        
        if (result.routes && result.routes[0]) {
            result.routes[0].steps.forEach(step => {
                step.path.forEach(path => {
                    const wgs84 = CoordinateConverter.gcj2wgs(path.lng, path.lat);
                    this.points.route.push(wgs84);
                });
            });
        }
    }
    
    clearAll() {
        // 清除导航路线
        this.driving.clear();
        
        // 清除标记
        Object.keys(this.markers).forEach(key => {
            if (Array.isArray(this.markers[key])) {
                this.markers[key].forEach(marker => {
                    if (marker) this.map.remove(marker);
                });
                this.markers[key] = [];
            } else if (this.markers[key]) {
                this.map.remove(this.markers[key]);
                this.markers[key] = null;
            }
        });
        
        // 清除自定义路线
        this.polylines.forEach(polyline => {
            this.map.remove(polyline);
        });
        this.polylines = [];
        
        // 清除坐标数据
        this.points = {
            start: null,
            end: null,
            waypoints: [],
            route: []
        };
        
        // 清除显示
        ['start-coord', 'end-coord', 'selected-coord', 'selected-coord-wgs84'].forEach(id => {
            this.updateCoordinateDisplay(id, '');
        });

        // 清除读取track文件
        document.getElementById('input-pathfile').value = '';
        
        this.showStatus('已清除所有路线和标记', 'info');
    }
    
    setVehiclePosition(lnglat) {
        const wgs84 = CoordinateConverter.gcj2wgs(lnglat.lng, lnglat.lat);
        fetch(`${this.config.gnssUrl}/update/loc/?lng=${wgs84[0]}&lat=${wgs84[1]}`)
            .then(response => response.json())
            .then(data => {
                console.log('车辆位置更新成功:', data);
                this.showStatus('车辆位置已更新', 'success');
            })
            .catch(error => {
                console.error('更新车辆位置失败:', error);
                this.showStatus('更新车辆位置失败', 'error');
            });
    }
    
    setMapCenter() {
        if (this.markers.point && this.map) {
            this.map.setCenter(this.markers.point.getPosition());
        }
    }
    
    loadPathFile(event) {
        const file = event.target.files[0];
        if (!file) {
            this.showStatus('请选择轨迹文件', 'warning');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const points = this.parsePathFile(e.target.result);
                this.drawPath(points);
                this.showStatus('轨迹文件加载成功', 'success');
            } catch (error) {
                console.error('解析轨迹文件失败:', error);
                this.showStatus('轨迹文件格式错误', 'error');
            }
        };
        reader.readAsText(file);
    }
    
    parsePathFile(content) {
        const lines = content.trim().split('\n');
        return lines.map(line => {
            const [lng, lat] = line.trim().split(/\s+/).map(Number);
            if (isNaN(lng) || isNaN(lat)) {
                throw new Error('无效的坐标数据');
            }
            return [lng, lat];
        });
    }
    
    drawPath(points) {
        const path = points.map(point => {
            const gcj02 = CoordinateConverter.wgs2gcj(point[0], point[1]);
            return new AMap.LngLat(gcj02[0], gcj02[1]);
        });
        
        const polyline = new AMap.Polyline({
            path: path,
            strokeColor: '#86ce79',
            strokeOpacity: 0.8,
            strokeWeight: 5,
            strokeStyle: 'solid'
        });
        
        this.map.add(polyline);
        this.polylines.push(polyline);
        
        if (path.length > 0) {
            this.map.setCenter(path[0]);
        }
    }
    
    savePoints() {
        if (!this.points.route || this.points.route.length === 0) {
            this.showStatus('没有路径点可保存', 'warning');
            return;
        }
        
        // 保存普通路径点
        const pathContent = this.points.route.map(point => point.join(' ')).join('\n');
        this.downloadFile('path.txt', pathContent);
        
        // 保存Prescan格式
        const prescanContent = this.points.route
            .map((point, index) => [index, point[1], point[0], 0].join(' '))
            .join('\n');
        this.downloadFile('prescan_path.txt', prescanContent);
        
        this.showStatus('路径点保存成功', 'success');
    }
    
    downloadFile(filename, content) {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
    
    startPositionTracking() {
        this.stopPositionTracking(); // 先停止现有的定时器
        
        const timer = setInterval(() => {
            this.fetchVehiclePosition();
        }, 500);
        
        this.timers.push(timer);
        this.showStatus('开始获取车辆位置', 'info');
    }
    
    stopPositionTracking() {
        this.timers.forEach(timer => clearInterval(timer));
        this.timers = [];
        this.showStatus('已停止获取车辆位置', 'info');
    }
    
    fetchVehiclePosition() {
        fetch(`${this.config.gnssUrl}/get/lnglat`)
            .then(response => response.json())
            .then(data => {
                if (data) {
                    const gcj02 = CoordinateConverter.wgs2gcj(data.lng, data.lat);
                    this.setPoint({ lng: gcj02[0], lat: gcj02[1] });
                }
            })
            .catch(error => {
                console.error('获取车辆位置失败:', error);
            });
    }
    
    startGnssSimulator() {
        fetch(`${this.config.gnssUrl}/start`)
            .then(response => response.json())
            .then(data => {
                console.log('GNSS模拟器启动成功:', data);
                this.showStatus('GNSS模拟器已启动', 'success');
            })
            .catch(error => {
                console.error('启动GNSS模拟器失败:', error);
                this.showStatus('启动GNSS模拟器失败', 'error');
            });
    }
    
    stopGnssSimulator() {
        fetch(`${this.config.gnssUrl}/stop`)
            .then(response => response.json())
            .then(data => {
                console.log('GNSS模拟器停止成功:', data);
                this.showStatus('GNSS模拟器已停止', 'info');
            })
            .catch(error => {
                console.error('停止GNSS模拟器失败:', error);
                this.showStatus('停止GNSS模拟器失败', 'error');
            });
    }
    
    showStatus(message, type = 'info') {
        const statusInfo = document.getElementById('status-info');
        if (!statusInfo) return;
        
        statusInfo.textContent = message;
        
        const colors = {
            info: '#f5f5f5',
            success: '#e8f5e9',
            warning: '#fff3e0',
            error: '#ffebee',
            ready: '#e3f2fd'
        };
        
        statusInfo.style.backgroundColor = colors[type] || colors.info;
    }
}

// 坐标转换工具类
class CoordinateConverter {
    static gcj2wgs(gcjLng, gcjLat) {
        const PI = Math.PI;
        const a = 6378245.0;
        const ee = 0.00669342162296594323;
        
        // 判断是否在国内
        if (gcjLng < 72.004 || gcjLng > 137.8347 || gcjLat < 0.8293 || gcjLat > 55.8271) {
            return [gcjLng.toFixed(6), gcjLat.toFixed(6)];
        }
        
        let dLat = this.transformLat(gcjLng - 105.0, gcjLat - 35.0);
        let dLng = this.transformLng(gcjLng - 105.0, gcjLat - 35.0);
        
        const radLat = gcjLat / 180.0 * PI;
        let magic = Math.sin(radLat);
        magic = 1 - ee * magic * magic;
        const sqrtMagic = Math.sqrt(magic);
        
        dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * PI);
        dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * PI);
        
        const wgsLat = gcjLat - dLat;
        const wgsLng = gcjLng - dLng;
        
        return [wgsLng.toFixed(6), wgsLat.toFixed(6)];
    }
    
    static wgs2gcj(wgsLng, wgsLat) {
        const PI = Math.PI;
        const a = 6378245.0;
        const ee = 0.00669342162296594323;
        
        // 判断是否在国内
        if (wgsLng < 72.004 || wgsLng > 137.8347 || wgsLat < 0.8293 || wgsLat > 55.8271) {
            return [wgsLng, wgsLat];
        }
        
        let dLat = this.transformLat(wgsLng - 105.0, wgsLat - 35.0);
        let dLng = this.transformLng(wgsLng - 105.0, wgsLat - 35.0);
        
        const radLat = wgsLat / 180.0 * PI;
        let magic = Math.sin(radLat);
        magic = 1 - ee * magic * magic;
        const sqrtMagic = Math.sqrt(magic);
        
        dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * PI);
        dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * PI);
        
        const gcjLat = wgsLat + dLat;
        const gcjLng = wgsLng + dLng;
        
        return [gcjLng, gcjLat];
    }
    
    static transformLat(x, y) {
        let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
        ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
        ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
        ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
        return ret;
    }
    
    static transformLng(x, y) {
        let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
        ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
        ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
        ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
        return ret;
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', function() {
    window.app = new MapRoutePlanner();
});
