import PropTypes from 'prop-types';
import React, { Component } from 'react';
import {
	SafeAreaView,
	InputAccessoryView,
	Button,
	StyleSheet,
	Switch,
	TextInput,
	Text,
	Platform,
	View
} from 'react-native';
import { connect } from 'react-redux';
import { isWebUri } from 'valid-url';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import ActionModal from '../../UI/ActionModal';
import Engine from '../../../core/Engine';
import StyledButton from '../../UI/StyledButton';
import { colors, fontStyles, baseStyles } from '../../../styles/common';
import { getNavigationOptionsTitle } from '../../UI/Navbar';
import { setShowHexData } from '../../../actions/settings';
import { strings } from '../../../../locales/i18n';
import DeviceInfo from 'react-native-device-info';
import Share from 'react-native-share'; // eslint-disable-line  import/default
import RNFS from 'react-native-fs';
// eslint-disable-next-line import/no-nodejs-modules
import { Buffer } from 'buffer';
import Logger from '../../../util/Logger';
import { isprivateConnection } from '../../../util/networks';
import URL from 'url-parse';
import ipfsGateways from '../../../util/ipfs-gateways.json';
import SelectComponent from '../../UI/SelectComponent';
import timeoutFetch from '../../../util/general';

const HASH_TO_TEST = 'Qmaisz6NMhDB51cCvNWa1GMS7LU1pAxdF4Ld6Ft9kZEP2a';
const HASH_STRING = 'Hello from IPFS Gateway Checker';

const styles = StyleSheet.create({
	wrapper: {
		backgroundColor: colors.white,
		flex: 1,
		padding: 24,
		paddingBottom: 48
	},
	title: {
		...fontStyles.normal,
		color: colors.fontPrimary,
		fontSize: 20,
		lineHeight: 20
	},
	desc: {
		...fontStyles.normal,
		color: colors.copy,
		fontSize: 14,
		lineHeight: 20,
		marginTop: 12
	},
	resetConfirm: {
		marginTop: 18
	},
	switchElement: {
		marginTop: 18
	},
	warningText: {
		...fontStyles.normal,
		color: colors.error,
		marginTop: 4,
		paddingLeft: 2,
		paddingRight: 4
	},
	warningContainer: {
		flexGrow: 1,
		flexShrink: 1
	},
	setting: {
		marginTop: 50
	},
	firstSetting: {
		marginTop: 0
	},
	rpcConfirmContainer: {
		marginTop: 12,
		flexDirection: 'row'
	},
	input: {
		...fontStyles.normal,
		borderColor: colors.lightGray,
		borderRadius: 5,
		borderWidth: 2,
		marginTop: 14,
		padding: 10
	},
	modalView: {
		alignItems: 'center',
		flex: 1,
		flexDirection: 'column',
		justifyContent: 'center',
		padding: 20
	},
	modalText: {
		...fontStyles.normal,
		fontSize: 18,
		textAlign: 'center'
	},
	modalTitle: {
		...fontStyles.bold,
		fontSize: 22,
		textAlign: 'center',
		marginBottom: 20
	},
	picker: {
		borderColor: colors.lightGray,
		borderRadius: 5,
		borderWidth: 2,
		marginTop: 16
	},
	inner: {
		paddingBottom: 48
	},
	syncConfirm: {
		marginTop: 18
	},
	inputAccessoryView: {
		alignItems: 'flex-end',
		paddingRight: 10
	}
});

/**
 * Main view for app configurations
 */
class AdvancedSettings extends Component {
	static propTypes = {
		/**
		 * A string that of the chosen ipfs gateway
		 */
		ipfsGateway: PropTypes.string,
		/**
		/* navigation object required to push new views
		*/
		navigation: PropTypes.object,
		/**
		 * Indicates whether hex data should be shown in transaction editor
		 */
		showHexData: PropTypes.bool,
		/**
		 * Called to toggle show hex data
		 */
		setShowHexData: PropTypes.func,
		/**
		 * Entire redux state used to generate state logs
		 */
		fullState: PropTypes.object
	};

	static navigationOptions = ({ navigation }) =>
		getNavigationOptionsTitle(strings('app_settings.advanced_title'), navigation);

	state = {
		resetModalVisible: false,
		rpcUrl: undefined,
		warningRpcUrl: '',
		inputWidth: Platform.OS === 'android' ? '99%' : undefined,
		onlineIpfsGateways: []
	};

	componentDidMount = async () => {
		await this.handleAvailableIpfsGateways();
		this.mounted = true;
		// Workaround https://github.com/facebook/react-native/issues/9958
		this.state.inputWidth &&
			setTimeout(() => {
				this.mounted && this.setState({ inputWidth: '100%' });
			}, 100);
	};

	componentWillUnmount = () => {
		this.mounted = false;
	};

	handleAvailableIpfsGateways = async () => {
		const ipfsGatewaysPromises = ipfsGateways.map(async ipfsGateway => {
			const testUrl = ipfsGateway.value + HASH_TO_TEST + '#x-ipfs-companion-no-redirect';
			try {
				const res = await timeoutFetch(testUrl);
				const text = await res.text();
				const available = text.trim() === HASH_STRING.trim();
				ipfsGateway.available = available;
				return ipfsGateway;
			} catch (e) {
				ipfsGateway.available = false;
				return ipfsGateway;
			}
		});
		const ipfsGatewaysAvailability = await Promise.all(ipfsGatewaysPromises);
		const onlineIpfsGateways = ipfsGatewaysAvailability.filter(ipfsGateway => ipfsGateway.available);
		const sortedOnlineIpfsGateways = onlineIpfsGateways.sort((a, b) => a.key < b.key);
		this.setState({ onlineIpfsGateways: sortedOnlineIpfsGateways });
	};

	displayResetAccountModal = () => {
		this.setState({ resetModalVisible: true });
	};

	resetAccount = () => {
		const { TransactionController } = Engine.context;
		const { navigation } = this.props;
		TransactionController.wipeTransactions(true);
		navigation.navigate('WalletView');
	};

	cancelResetAccount = () => {
		this.setState({ resetModalVisible: false });
	};

	addRpcUrl = () => {
		const { PreferencesController, NetworkController } = Engine.context;
		const { rpcUrl } = this.state;
		const { navigation } = this.props;
		if (this.validateRpcUrl()) {
			const url = new URL(rpcUrl);
			!isprivateConnection(url.hostname) && url.set('protocol', 'https:');
			PreferencesController.addToFrequentRpcList(url.href);
			NetworkController.setRpcTarget(url.href);
			navigation.navigate('WalletView');
		}
	};

	validateRpcUrl = () => {
		const { rpcUrl } = this.state;
		if (!isWebUri(rpcUrl)) {
			const appendedRpc = `http://${rpcUrl}`;
			if (isWebUri(appendedRpc)) {
				this.setState({ warningRpcUrl: strings('app_settings.invalid_rpc_prefix') });
			} else {
				this.setState({ warningRpcUrl: strings('app_settings.invalid_rpc_url') });
			}
			return false;
		}
		const url = new URL(rpcUrl);
		const privateConnection = isprivateConnection(url.hostname);
		if (!privateConnection && url.protocol === 'http:') {
			this.setState({ warningRpcUrl: strings('app_settings.invalid_rpc_prefix') });
			return false;
		}
		return true;
	};

	onRpcUrlChange = url => {
		this.setState({ rpcUrl: url });
	};

	toggleShowHexData = showHexData => {
		this.props.setShowHexData(showHexData);
	};

	goToSyncWithExtension = () => {
		this.props.navigation.push('SyncWithExtensionView', { existingUser: true });
	};

	downloadStateLogs = async () => {
		const appName = DeviceInfo.getApplicationName();
		const appVersion = DeviceInfo.getVersion();
		const buildNumber = DeviceInfo.getBuildNumber();
		const path = RNFS.DocumentDirectoryPath + `/state-logs-v${appVersion}-(${buildNumber}).json`;
		// A not so great way to copy objects by value
		const fullState = JSON.parse(JSON.stringify(this.props.fullState));

		// Remove stuff we don't want to sync
		delete fullState.engine.backgroundState.AssetsController;
		delete fullState.engine.backgroundState.AssetsContractController;
		delete fullState.engine.backgroundState.AssetsDetectionController;
		delete fullState.engine.backgroundState.PhishingController;
		delete fullState.engine.backgroundState.AssetsContractController;

		// Add extra stuff
		fullState.engine.backgroundState.KeyringController.keyrings = Engine.context.KeyringController.state.keyrings;
		try {
			const data = JSON.stringify(fullState);

			let url = `data:text/plain;base64,${new Buffer(data).toString('base64')}`;
			// // Android accepts attachements as BASE64
			if (Platform.OS === 'ios') {
				await RNFS.writeFile(path, data, 'utf8');
				url = path;
			}

			await Share.open({
				subject: `${appName} State logs -  v${appVersion} (${buildNumber})`,
				title: `${appName} State logs -  v${appVersion} (${buildNumber})`,
				url
			});
		} catch (err) {
			Logger.error('State log error', err);
		}
	};

	setIpfsGateway = ipfsGateway => {
		const { PreferencesController } = Engine.context;
		PreferencesController.setIpfsGateway(ipfsGateway);
	};

	render = () => {
		const { showHexData, ipfsGateway } = this.props;
		const { resetModalVisible, onlineIpfsGateways } = this.state;
		return (
			<SafeAreaView style={baseStyles.flexGrow}>
				<KeyboardAwareScrollView style={styles.wrapper} resetScrollToCoords={{ x: 0, y: 0 }}>
					<View style={styles.inner}>
						<ActionModal
							modalVisible={resetModalVisible}
							confirmText={strings('app_settings.reset_account_confirm_button')}
							cancelText={strings('app_settings.reset_account_cancel_button')}
							onCancelPress={this.cancelResetAccount}
							onRequestClose={this.cancelResetAccount}
							onConfirmPress={this.resetAccount}
						>
							<View style={styles.modalView}>
								<Text style={styles.modalTitle}>
									{strings('app_settings.reset_account_modal_title')}
								</Text>
								<Text style={styles.modalText}>
									{strings('app_settings.reset_account_modal_message')}
								</Text>
							</View>
						</ActionModal>
						<View style={[styles.setting, styles.firstSetting]}>
							<Text style={styles.title}>{strings('app_settings.reset_account')}</Text>
							<Text style={styles.desc}>{strings('app_settings.reset_desc')}</Text>
							<StyledButton
								type="info"
								onPress={this.displayResetAccountModal}
								containerStyle={styles.resetConfirm}
							>
								{strings('app_settings.reset_account_button')}
							</StyledButton>
						</View>
						<View style={styles.setting}>
							<Text style={styles.title}>{strings('app_settings.sync_with_extension')}</Text>
							<Text style={styles.desc}>{strings('app_settings.sync_with_extension_desc')}</Text>
							<StyledButton
								type="info"
								onPress={this.goToSyncWithExtension}
								containerStyle={styles.syncConfirm}
							>
								{strings('app_settings.sync')}
							</StyledButton>
						</View>
						<View style={styles.setting}>
							<Text style={styles.title}>{strings('app_settings.new_RPC_URL')}</Text>
							<Text style={styles.desc}>{strings('app_settings.rpc_desc')}</Text>
							<TextInput
								style={[styles.input, this.state.inputWidth ? { width: this.state.inputWidth } : {}]}
								autoCapitalize={'none'}
								autoCorrect={false}
								value={this.state.rpcUrl}
								onBlur={this.addRpcUrl}
								onChangeText={this.onRpcUrlChange}
								placeholder={strings('app_settings.new_RPC_URL')}
								inputAccessoryViewID={'rpc_url_accesory_view'}
							/>
							{Platform.OS === 'ios' && (
								<InputAccessoryView nativeID={'rpc_url_accesory_view'}>
									<View style={styles.inputAccessoryView} backgroundColor={colors.lighterGray}>
										<Button onPress={this.addRpcUrl} title="Done" />
									</View>
								</InputAccessoryView>
							)}
							<View style={styles.rpcConfirmContainer}>
								<View style={styles.warningContainer}>
									<Text style={styles.warningText}>{this.state.warningRpcUrl}</Text>
								</View>
							</View>
						</View>

						<View style={[styles.setting]}>
							<Text style={styles.title}>{strings('app_settings.ipfs_gateway')}</Text>
							<Text style={styles.desc}>{strings('app_settings.ipfs_gateway_desc')}</Text>
							<View style={styles.picker}>
								<SelectComponent
									selectedValue={ipfsGateway}
									defaultValue={strings('app_settings.ipfs_gateway_down')}
									onValueChange={this.setIpfsGateway}
									label={strings('app_settings.ipfs_gateway')}
									options={onlineIpfsGateways}
								/>
							</View>
						</View>
						<View style={styles.setting}>
							<Text style={styles.title}>{strings('app_settings.show_hex_data')}</Text>
							<Text style={styles.desc}>{strings('app_settings.hex_desc')}</Text>
							<View style={styles.switchElement}>
								<Switch
									value={showHexData}
									onValueChange={this.toggleShowHexData}
									trackColor={
										Platform.OS === 'ios' ? { true: colors.primary, false: colors.concrete } : null
									}
									ios_backgroundColor={colors.slate}
								/>
							</View>
						</View>
						<View style={styles.setting}>
							<Text style={styles.title}>{strings('app_settings.state_logs')}</Text>
							<Text style={styles.desc}>{strings('app_settings.state_logs_desc')}</Text>
							<StyledButton
								type="info"
								onPress={this.downloadStateLogs}
								containerStyle={styles.syncConfirm}
							>
								{strings('app_settings.state_logs_button')}
							</StyledButton>
						</View>
					</View>
				</KeyboardAwareScrollView>
			</SafeAreaView>
		);
	};
}

const mapStateToProps = state => ({
	ipfsGateway: state.engine.backgroundState.PreferencesController.ipfsGateway,
	showHexData: state.settings.showHexData,
	fullState: state
});

const mapDispatchToProps = dispatch => ({
	setShowHexData: showHexData => dispatch(setShowHexData(showHexData))
});

export default connect(
	mapStateToProps,
	mapDispatchToProps
)(AdvancedSettings);