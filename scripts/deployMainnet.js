// @dev. This script will deploy this V1.1 of Dove. It will deploy the whole ecosystem except for the LP tokens and their bonds. 
// This should be enough of a test environment to learn about and test implementations with the Dove as of V1.1.
// Not that the every instance of the Treasury's function 'valueOf' has been changed to 'valueOfToken'... 
// This solidity function was conflicting w js object property name
const IERC20_ABI = require('../contracts/abi/IERC20.json');
const UniswapV2_ABI = require('../contracts/abi/IUniswapV2Factory.json').abi;

const { ethers } = require("hardhat");

async function main() {

    // Get the signer
    const [deployer] = await ethers.getSigners();
    console.log("DOVE Mainnet Deployment with Address: " + deployer.address);

    // Define variables
    const initialIndex = 1000000000; // 1.0
    const firstEpochTimestamp = (await deployer.getBlock()).timestamp + 30 * 60; // 30 minutes from now
    const epochDuration = 28800; // 8 hours
    const initalRewardRate = '5000';
    const deadAddress = '0x0000000000000000000000000000000000000000';
    const largeApproval = '100000000000000000000000000000000';
    const usdcBondBCV = '369'; 
    const usdcAddress = '0xc21223249CA28397B4B6541dfFaEcC539BfF0c59';
    const bondVestingLength = 5 * 24 * 3600; // 5 days
    const minBondPrice = '0'; //TBC: Launch Price
    const maxBondPayout = '1000';
    const bondFee = '10000'
    const maxBondDebt = '1000000000000000'
    const initialBondDebt = '0'
    const warmupPeriod = '3'
    const FactoryAddr = '0x462C98Cae5AffEED576c98A55dAA922604e2D875' //TBC: Factory Address

    // Deploy the Dove contract
    const DOVE = await ethers.getContractFactory("DoveERC20Token");
    const dove = await DOVE.deploy();
    console.log("Dove deployed at: " + dove.address);

    // Deploy the sDOVE contract
    const sDOVE = await ethers.getContractFactory("sDove");
    const sdove = await sDOVE.deploy();
    console.log("sDove deployed at: " + sDOVE.address);

    // Deploy the Treasury contract
    const Treasury = await ethers.getContractFactory("DoveTreasury");
    const treasury = await Treasury.deploy(dove.address, usdcAddress, 0);
    console.log("Treasury deployed at: " + treasury.address);

    // Deploy the BondingCalculator contract
    const BondingCalculator = await ethers.getContractFactory("DoveBondingCalculator");
    const bondingCalculator = await BondingCalculator.deploy(dove.address);
    console.log("BondingCalculator deployed at: " + bondingCalculator.address);

    // Deploy the staking distributor contract
    const StakingDistributor = await ethers.getContractFactory("Distributor");
    const stakingDistributor = await StakingDistributor.deploy(treasury.address, dove.address, epochDuration, firstEpochTimestamp);
    console.log("StakingDistributor deployed at: " + stakingDistributor.address);

    // Deploy the staking contract
    const Staking = await ethers.getContractFactory("DoveStaking");
    const staking = await Staking.deploy(dove.address, sdove.address, epochDuration, 1, firstEpochTimestamp);
    console.log("Staking deployed at: " + staking.address);

    // Deploy staking warmup contract
    const StakingWarmup = await ethers.getContractFactory('StakingWarmup');
    const stakingWarmup = await StakingWarmup.deploy(staking.address, sdove.address);
    console.log("StakingWarmup deployed at: " + stakingWarmup.address);

    // Deploy staking helper contract
    const StakingHelper = await ethers.getContractFactory('StakingHelper');
    const stakingHelper = await StakingHelper.deploy(staking.address, dove.address);
    console.log("StakingHelper deployed at: " + stakingHelper.address);

    const uniswapFactory = new ethers.Contract(
      FactoryAddr,
      UniswapV2_ABI,
      deployer
    )

    await (await uniswapFactory.createPair(dove.address, usdcAddress)).wait()
    const lpAddress = await uniswapFactory.getPair(dove.address, usdcAddress)
    console.log("DOVE-USDC LP deployed at: " + lpAddress);

    // Deploy the Bonding contract
    const Bonding = await ethers.getContractFactory("DoveBondDepository");
    const usdcBond = await Bonding.deploy(dove.address, usdcAddress, treasury.address, deployer.address, deadAddress);
    console.log("USDC Bonding deployed at: " + usdcBond.address);

    // Deploy the DOVE-USDC Bonding contract
    const DoveUsdcBonding = await ethers.getContractFactory("DoveBondDepository");
    const doveUsdcBond = await DoveUsdcBonding.deploy(dove.address, lpAddress, treasury.address, deployer.address, bondingCalculator.address);
    console.log("DOVE-USDC LP Bonding deployed at: " + doveUsdcBond.address);
         
    // Attach USDC Token 
    const CommonERC20 = new ethers.Contract('0x0000000000000000000000000000000000000000', IERC20_ABI);
    const usdc = await CommonERC20.attach(usdcAddress);

    // queue and toggle USDC reserve depositor
    await (await treasury.queue('0', usdcBond.address)).wait()
    await treasury.toggle('0', usdcBond.address, zeroAddress)

    // queue and toggle deployer reserve depositor
    await (await treasury.queue('0', deployer.address)).wait()
    await treasury.toggle('0', deployer.address, zeroAddress)

    // queue and toggle deployer liquidity depositor
    await (treasury.queue('4', deployer.address)).wait();
    await treasury.toggle('4', deployer.address, zeroAddress);
    
    // queue and toggle DOVE-USDC liquidity depositor
    await (await treasury.queue('4', doveUsdcBond.address)).wait()
    await treasury.toggle('4', doveUsdcBond.address, deadAddress)

    // queue and toggle reward manager
    await treasury.queue('8', distributor.address);
    await (treasury.toggle('8', distributor.address, zeroAddress)).wait();

    // approve the treasury to spend USDC
    await (await usdc.approve(treasury.address, largeApproval)).wait();
    await (await usdc.approve(usdcBond.address, largeApproval)).wait();

    // Approve staking and staking helper contact to spend deployer's DOVE
    await (dove.approve(staking.address, largeApproval)).wait();
    await (dove.approve(stakingHelper.address, largeApproval)).wait();
    //uint _controlVariable, uint _minimumPrice, uint _maxPayout, uint _fee, uint _maxDebt, uint _initialDebt, uint32 _vestingTerm
    await usdcBond.initializeBondTerms(usdcBondBCV, minBondPrice, maxBondPayout, bondFee, maxBondDebt, initialBondDebt, );
    await doveUsdcBond.initializeBondTerms('100', minBondPrice, maxBondPayout, bondFee, maxBondDebt, initialBondDebt, );

    await usdcBond.setStaking(staking.address, stakingHelper.address);
    await doveUsdcBond.setStaking(staking.address, stakingHelper.address);

    // Initialize sDOVE and set the index
    await sdove.initialize(staking.address);
    await sdove.setIndex(initialIndex);

      // set distributor contract and warmup contract
    await staking.setContract('0', stakingDistributor.address);
    await staking.setContract('1', stakingWarmup.address);

    // Set treasury for DOVE token
    await dove.setVault(treasury.address);

    // Add staking contract as distributor recipient
    await stakingDistributor.addRecipient(staking.address, initalRewardRate);

    console.log(
      JSON.stringify({
        DOVE: dove.address,
        sDOVE: sdove.address,
        Treasury: treasury.address,
        BondingCalculator: bondingCalculator.address,
        StakingDistributor: stakingDistributor.address,
        Staking: staking.address,
        StakingWarmpup: stakingWarmup.address,
        StakingHelper: stakingHelper.address,
        RESERVES: {
          USDC: usdcAddress,
          DOVEUSDC: lpAddress,
        },
        BONDS: {
          USDC: usdcBond.address,
          DOVEUSDC: doveUsdcBond.address,
        },
      })
    )
    }

main()
    .then(() => process.exit())
    .catch(error => {
        console.error(error);
        process.exit(1);
})