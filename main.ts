import { Construct } from 'constructs';
import { App, TerraformStack } from 'cdktf';
import { 
  AlicloudProvider,
  Vpc,
  Vswitch,
  SecurityGroup,
  SecurityGroupRule,
  KeyPair,
  DataAlicloudImages,
  Instance,
  Eip,
  EipAssociation,
} from './.gen/providers/alicloud';

class MyStack extends TerraformStack {
  resourceGroup: string;
  imageId: string;
  keyName: string;
  vpcs: {[id: string]: Vpc} = {}
  securityGroups: {[id: string]: SecurityGroup} = {};
  vswitches: {[id: string]: Vswitch} = {};

  constructor(scope: Construct, name: string, accessKey: string, secretKey: string,
     region: string, resourceGroup: string) {
    super(scope, name);

    this.resourceGroup = resourceGroup;

    new AlicloudProvider(this, 'alicloud', {
      region,
      accessKey,
      secretKey,
    });

    this.imageId = new DataAlicloudImages(this, 'images-debian-10', {
      owners: 'self',
      nameRegex: '^debian-10$',
    }).images('0').id;

    this.keyName = new KeyPair(this, 'key-pair-test', {
      resourceGroupId: this.resourceGroup,
      keyName: 'test',
      publicKey: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ...',
    }).keyName!;
  }

  createVpc(name: string, cidrBlock: string, vswitches: {[id: string]: string}) {
    this.vpcs[name] = new Vpc(this, `vpc-${name}`, {
      resourceGroupId: this.resourceGroup,
      name,
      cidrBlock,
    });

    this.securityGroups[name] = new SecurityGroup(this, `security-group-${name}`, {
      resourceGroupId: this.resourceGroup,
      name,
      vpcId: this.vpcs[name].id,
    });

    new SecurityGroupRule(this, `security-group-rule-${name}`, {
      type: 'ingress',
      ipProtocol: 'tcp',
      cidrIp: '0.0.0.0/0',
      portRange: '22/22',
      securityGroupId: this.securityGroups[name].id!,
    });

    for (let availabilityZone in vswitches) {
      let cidrBlock = vswitches[availabilityZone];
      this.vswitches[`${name}-${availabilityZone}`] = new Vswitch(this, `vswitch-${name}-${availabilityZone}`, {
        vpcId: this.vpcs[name].id!,
        cidrBlock,
        availabilityZone,
      });
    }
  }

  createInstance(name: string, vpcName: string, availabilityZone: string, type='ecs.t5-lc2m1.nano') {
    const instance = new Instance(this, `instance-${name}`, {
      resourceGroupId: this.resourceGroup,
      availabilityZone,
      securityGroups: [this.securityGroups[vpcName].id!],
      instanceType: type,
      systemDiskSize: 20,
      imageId: this.imageId,
      instanceName: name,
      vswitchId: this.vswitches[`${vpcName}-${availabilityZone}`].id,
      keyName: this.keyName,
    });

    const eip = new Eip(this, `eip-${name}`, {
      resourceGroupId: this.resourceGroup,
      bandwidth: 5,
      internetChargeType: 'PayByTraffic',
    });

    new EipAssociation(this, `eip-association-${name}`, {
      allocationId: eip.id!,
      instanceId: instance.id!,
    });
  };
}

const app = new App();

import { accessKey, secretKey } from './secret';
const myStack = new MyStack(app, 'alicloud-demo', accessKey, secretKey,
  'cn-hangzhou', 'rg-...');
myStack.createVpc('vpc1', '172.16.0.0/12', {
  'cn-hangzhou-h': '172.16.0.0/21',
})
myStack.createInstance('instance1', 'vpc1', 'cn-hangzhou-h');

app.synth();
